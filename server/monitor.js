const axios = require('axios');
const { pool } = require('./db');
const { rotate } = require('./rotator');

const DETECTION_URL = process.env.DETECTION_API_URL || 'https://domain.smsapp.co';
const POLL_MS = 10 * 1000;

const state = {
  running:       false,
  configured:    false,
  lastPoll:      null,
  lastError:     null,
  lastDetection: null, // { domain, at, method, threatType }
};

// Remove any banned domains that are still present in their RT streams,
// regardless of whether the detection API still reports them as flagged.
async function cleanupBannedFromStreams() {
  const rtApiKey = process.env.REDTRACK_API_KEY;
  if (!rtApiKey) return;

  const { rows: banned } = await pool.query(`
    SELECT d.id, d.domain, d.redtrack_lander_id, f.redtrack_stream_id, d.funnel_id
    FROM domains d
    JOIN funnels f ON f.id = d.funnel_id
    WHERE d.status = 'banned'
      AND d.redtrack_lander_id IS NOT NULL
      AND f.redtrack_stream_id IS NOT NULL
  `);
  if (banned.length === 0) return;

  const { data: list } = await axios.get('https://api.redtrack.io/streams', {
    params: { api_key: rtApiKey, template: true, per: 500 }, timeout: 10000,
  });
  const streams = (list.items || list || []).map(s => ({ ...s, id: String(s.id || s._id) }));

  const byStream = {};
  for (const d of banned) {
    const key = String(d.redtrack_stream_id);
    if (!byStream[key]) byStream[key] = [];
    byStream[key].push(String(d.redtrack_lander_id));
  }

  for (const [streamId, landerIds] of Object.entries(byStream)) {
    const stream = streams.find(s => s.id === streamId);
    if (!stream) continue;

    const before = (stream.landings || []).length;
    const updatedLandings = (stream.landings || []).filter(
      l => !landerIds.includes(String(l.id))
    );
    if (updatedLandings.length === before) continue;

    const patch = { ...stream, landings: updatedLandings };
    if (updatedLandings.length === 0) patch.direct = true;
    await axios.put(
      `https://api.redtrack.io/streams/${streamId}`,
      patch,
      { params: { api_key: rtApiKey }, timeout: 10000 }
    );

    const funnelRow = banned.find(d => String(d.redtrack_stream_id) === streamId);
    for (const landerId of landerIds) {
      const d = banned.find(b => String(b.redtrack_lander_id) === landerId && String(b.redtrack_stream_id) === streamId);
      if (!d) continue;
      await pool.query(
        `INSERT INTO rotation_history (funnel_id, from_domain, to_domain, trigger_source, status)
         VALUES ($1, $2, NULL, 'auto_ban', 'success')`,
        [funnelRow?.funnel_id || null, d.domain]
      ).catch(() => {});
    }
    console.log(`[monitor] Cleanup: removed ${before - updatedLandings.length} banned lander(s) from stream ${streamId}`);
  }
}

async function pollOnce() {
  const apiKey = process.env.DETECTION_API_KEY;
  if (!apiKey) return;

  await cleanupBannedFromStreams().catch(err =>
    console.error('[monitor] Cleanup error:', err.message)
  );

  // Fetch current domain states and event log in parallel
  const [domainsRes, logsRes] = await Promise.all([
    axios.get(`${DETECTION_URL}/api/domains`, {
      headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000,
    }),
    axios.get(`${DETECTION_URL}/api/logs?limit=500`, {
      headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000,
    }),
  ]);

  state.lastPoll  = new Date();
  state.lastError = null;

  const extDomains = Array.isArray(domainsRes.data) ? domainsRes.data : [];
  const logs       = Array.isArray(logsRes.data)    ? logsRes.data    : [];

  // Sync is_suspicious from /api/domains
  const suspicious = extDomains.filter(d => d.is_suspicious).map(d => d.domain);
  await pool.query(`UPDATE domains SET is_suspicious = false WHERE is_suspicious = true`);
  if (suspicious.length > 0) {
    await pool.query(`UPDATE domains SET is_suspicious = true WHERE domain = ANY($1)`, [suspicious]);
    console.log(`[monitor] ${suspicious.length} suspicious domain(s): ${suspicious.join(', ')}`);
  }

  // Process currently flagged domains
  const flagged = extDomains.filter(d => d.is_flagged);

  // Group log entries — only for flagged domains
  const flaggedSet = new Set(flagged.map(d => d.domain));
  const domainLogs = {};
  for (const log of logs) {
    if (!flaggedSet.has(log.domain)) continue;
    if (!domainLogs[log.domain]) domainLogs[log.domain] = [];
    domainLogs[log.domain].push(log);
  }

  for (const ext of flagged) {
    const { rows: [domain] } = await pool.query(
      `SELECT id, status, funnel_id, redtrack_lander_id FROM domains WHERE domain = $1`,
      [ext.domain]
    );

    if (!domain) continue;

    // Persist combined threat info from all log entries for this domain
    const allLogs = domainLogs[ext.domain] || [];
    if (allLogs.length > 0) {
      const methods     = [...new Set(allLogs.map(l => l.method).filter(Boolean))];
      const threatTypes = [...new Set(allLogs.map(l => l.threat_type).filter(Boolean))];
      const latestAt    = allLogs.reduce((max, l) =>
        !max || new Date(l.detected_at) > new Date(max) ? l.detected_at : max, null);
      await pool.query(
        `UPDATE domains SET flagged_at = $1, threat_types = $2, detection_method = $3 WHERE id = $4`,
        [new Date(latestAt), JSON.stringify(threatTypes), JSON.stringify(methods), domain.id]
      );
    }

    // Auto-ban flagged standby domains; clean up banned domains still in stream
    if (domain.status === 'standby' || domain.status === 'banned') {
      if (domain.status === 'standby') {
        console.log(`[monitor] Flagged standby domain ${ext.domain} — banning`);
        await pool.query(
          `UPDATE domains SET status = 'banned', banned_at = NOW() WHERE id = $1`,
          [domain.id]
        );
        await pool.query(
          `INSERT INTO rotation_history (funnel_id, from_domain, to_domain, trigger_source, status)
           VALUES ($1, $2, NULL, 'auto_ban', 'success')`,
          [domain.funnel_id || null, ext.domain]
        ).catch(() => {});
      }
      if (domain.funnel_id && domain.redtrack_lander_id) {
        try {
          const { rows: [funnel] } = await pool.query(
            `SELECT redtrack_stream_id FROM funnels WHERE id = $1`, [domain.funnel_id]
          );
          if (funnel?.redtrack_stream_id) {
            const rtApiKey = process.env.REDTRACK_API_KEY;
            const { data: list } = await axios.get('https://api.redtrack.io/streams', {
              params: { api_key: rtApiKey, template: true, per: 500 }, timeout: 10000,
            });
            const items = (list.items || list || []).map(s => ({ ...s, id: s.id || s._id }));
            const stream = items.find(s => String(s.id) === String(funnel.redtrack_stream_id));
            if (stream) {
              const updatedLandings = (stream.landings || []).filter(
                l => String(l.id) !== String(domain.redtrack_lander_id)
              );
              if (updatedLandings.length < (stream.landings || []).length) {
                const patch = { ...stream, landings: updatedLandings };
                if (updatedLandings.length === 0) patch.direct = true;
                await axios.put(
                  `https://api.redtrack.io/streams/${funnel.redtrack_stream_id}`,
                  patch,
                  { params: { api_key: rtApiKey }, timeout: 10000 }
                );
                console.log(`[monitor] Removed ${ext.domain} from RT stream`);
              }
            }
          }
        } catch (err) {
          console.error(`[monitor] Failed to remove ${ext.domain} from stream:`, err.message);
        }
      }
      continue;
    }

    // Skip if auto-rotation disabled on the funnel
    if (domain.funnel_id) {
      const { rows: [funnel] } = await pool.query(
        `SELECT auto_rotate FROM funnels WHERE id = $1`, [domain.funnel_id]
      );
      if (funnel && funnel.auto_rotate === false) {
        console.log(`[monitor] Skipped rotation for ${ext.domain} — auto-rotate disabled`);
        continue;
      }
    }

    console.log(`[monitor] Flagged active domain ${ext.domain} — triggering rotation`);
    state.lastDetection = {
      domain:     ext.domain,
      at:         new Date(),
      methods:    [...new Set(allLogs.map(l => l.method).filter(Boolean))],
      threatTypes:[...new Set(allLogs.map(l => l.threat_type).filter(Boolean))],
    };

    try {
      const result = await rotate(ext.domain, 'auto_detection');
      console.log(`[monitor] Rotated ${result.fromDomain} → ${result.toDomain}`);
    } catch (err) {
      console.error(`[monitor] Rotation failed for ${ext.domain}:`, err.message);
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

  run();
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
