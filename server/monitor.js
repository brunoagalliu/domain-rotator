const axios = require('axios');
const { pool } = require('./db');
const { rotate } = require('./rotator');

const DETECTION_URL = process.env.DETECTION_API_URL || 'https://domain.smsapp.co';
const POLL_MS = 60 * 1000;

const state = {
  running:       false,
  configured:    false,
  paused:        false,
  lastPoll:      null,
  lastError:     null,
  lastDetection: null, // { domain, at, threats }
};

async function pollOnce() {
  const apiKey = process.env.DETECTION_API_KEY;
  if (!apiKey || state.paused) return;

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
      `SELECT id, status FROM domains WHERE domain = $1`,
      [scan.domain]
    );

    if (!domain) continue;

    // Always persist flagged info so it shows in the UI
    await pool.query(
      `UPDATE domains SET flagged_at = $1, threat_types = $2 WHERE id = $3`,
      [new Date(scan.scan_date), JSON.stringify(scan.threat_types || []), domain.id]
    );

    if (domain.status !== 'active') continue;

    console.log(`[monitor] Flagged: ${scan.domain} — triggering rotation`);
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

function setPaused(paused) {
  state.paused = paused;
}

function getState() {
  return {
    running:             state.running,
    configured:          state.configured,
    paused:              state.paused,
    lastPoll:            state.lastPoll,
    lastError:           state.lastError,
    lastDetection:       state.lastDetection,
    pollIntervalSeconds: POLL_MS / 1000,
  };
}

module.exports = { start, getState, setPaused };
