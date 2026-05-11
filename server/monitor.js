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
      `SELECT id FROM domains WHERE domain = $1 AND status = 'active'`,
      [scan.domain]
    );

    if (!domain) continue;

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
