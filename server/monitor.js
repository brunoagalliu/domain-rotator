const axios = require('axios');
const { pool } = require('./db');
const { rotate } = require('./rotator');

const DETECTION_URL = process.env.DETECTION_API_URL || 'https://domain.smsapp.co';
const POLL_MS = 60 * 1000;

const state = {
  running:       false,
  configured:    false,
  lastPoll:      null,
  lastError:     null,
  lastDetection: null, // { domain, at, threats }
};

async function pollOnce() {
  const apiKey = process.env.DETECTION_API_KEY;
  if (!apiKey) return;

  const { data: scans } = await axios.get(`${DETECTION_URL}/api/scans`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 15000,
  });

  state.lastPoll  = new Date();
  state.lastError = null;

  // Filter to unsafe scans only; duplicate-rotation is prevented by the
  // status='active' check below — banned domains won't match after first rotation
  const flagged = (Array.isArray(scans) ? scans : []).filter(s => s.is_safe === 0);

  for (const scan of flagged) {
    const { rows: [domain] } = await pool.query(
      `SELECT id, status, funnel_id, redtrack_lander_id FROM domains WHERE domain = $1`,
      [scan.domain]
    );

    if (!domain) continue;

    // Always persist flagged info so it shows in the UI
    await pool.query(
      `UPDATE domains SET flagged_at = $1, threat_types = $2 WHERE id = $3`,
      [new Date(scan.scan_date), JSON.stringify(scan.threat_types || []), domain.id]
    );

    if (domain.status === 'banned') continue;

    // Auto-ban flagged standby domains and remove from RT stream
    if (domain.status === 'standby') {
      console.log(`[monitor] Flagged standby domain ${scan.domain} — banning and removing from stream`);
      await pool.query(
        `UPDATE domains SET status = 'banned', banned_at = NOW() WHERE id = $1`,
        [domain.id]
      );
      if (domain.funnel_id && domain.redtrack_lander_id) {
        try {
          const { rows: [funnel] } = await pool.query(
            `SELECT redtrack_stream_id FROM funnels WHERE id = $1`, [domain.funnel_id]
          );
          if (funnel?.redtrack_stream_id) {
            const apiKey = process.env.REDTRACK_API_KEY;
            const { data: list } = await axios.get('https://api.redtrack.io/streams', {
              params: { api_key: apiKey, template: true, per: 500 }, timeout: 10000,
            });
            const items = (list.items || list || []).map(s => ({ ...s, id: s.id || s._id }));
            const stream = items.find(s => String(s.id) === String(funnel.redtrack_stream_id));
            if (stream) {
              const updatedLandings = (stream.landings || []).filter(
                l => String(l.id) !== String(domain.redtrack_lander_id)
              );
              const patch = { ...stream, landings: updatedLandings };
              if (updatedLandings.length === 0) patch.direct = true;
              await axios.put(
                `https://api.redtrack.io/streams/${funnel.redtrack_stream_id}`,
                patch,
                { params: { api_key: apiKey }, timeout: 10000 }
              );
              console.log(`[monitor] Removed ${scan.domain} from RT stream`);
            }
          }
        } catch (err) {
          console.error(`[monitor] Failed to remove ${scan.domain} from stream:`, err.message);
        }
      }
      continue;
    }

    // Skip if the funnel has auto-rotation disabled
    if (domain.funnel_id) {
      const { rows: [funnel] } = await pool.query(
        `SELECT auto_rotate FROM funnels WHERE id = $1`, [domain.funnel_id]
      );
      if (funnel && funnel.auto_rotate === false) {
        console.log(`[monitor] Skipped rotation for ${scan.domain} — auto-rotate disabled on funnel`);
        continue;
      }
    }

    console.log(`[monitor] Flagged active domain ${scan.domain} — triggering rotation`);
    state.lastDetection = {
      domain:  scan.domain,
      at:      new Date(),
      threats: scan.threat_types,
    };

    try {
      const result = await rotate(scan.domain, 'auto_detection');
      console.log(`[monitor] Rotated ${result.fromDomain} → ${result.toDomain}`);
    } catch (err) {
      console.error(`[monitor] Rotation failed for ${scan.domain}:`, err.message);
    }
  }
}

function start() {
  const apiKey = process.env.DETECTION_API_KEY;
  state.configured = !!apiKey;

  if (!apiKey) {
    console.warn('[monitor] DETECTION_API_KEY not set — auto-rotation disabled');
    return;
  }

  state.running = true;

  const run = () =>
    pollOnce().catch(err => {
      state.lastError = err.message;
      console.error('[monitor] Poll error:', err.message);
    });

  run(); // immediate on startup
  setInterval(run, POLL_MS);
  console.log('[monitor] Started — polling every 60s');
}

function getState() {
  return {
    running:             state.running,
    configured:          state.configured,
    lastPoll:            state.lastPoll,
    lastError:           state.lastError,
    lastDetection:       state.lastDetection,
    pollIntervalSeconds: POLL_MS / 1000,
  };
}

module.exports = { start, getState };
