const path = require('path');
const axios = require('axios');
const { pool } = require('./db');
const { uploadLander } = require('./cpanel');

const LANDERS_DIR = path.join(__dirname, '../landers');

// ── RT stream helpers ─────────────────────────────────────────────────────────

async function fetchStream(apiKey, streamId) {
  const { data: list } = await axios.get(
    'https://api.redtrack.io/streams',
    { params: { api_key: apiKey, template: true, per: 500 }, timeout: 10000 }
  );
  const items = (list.items || list || []).map(s => ({ ...s, id: s.id || s._id }));
  return items.find(s => String(s.id) === String(streamId)) || null;
}

async function putStream(apiKey, streamId, stream) {
  await axios.put(
    `https://api.redtrack.io/streams/${streamId}`,
    stream,
    { params: { api_key: apiKey }, timeout: 10000 }
  );
}

// Rotation: remove banned lander from stream, promote next lander to weight 100
async function rotateInStream(streamId, bannedLanderId, nextLanderId) {
  const apiKey = process.env.REDTRACK_API_KEY;
  if (!apiKey || !streamId || !nextLanderId) return;

  const stream = await fetchStream(apiKey, streamId);
  if (!stream) throw new Error(`Stream ${streamId} not found in RT`);

  const nextInStream = (stream.landings || []).find(l => String(l.id) === String(nextLanderId));
  if (!nextInStream) throw new Error(`Backup lander ${nextLanderId} not found in stream ${streamId} — add it to the funnel template first`);

  const updatedLandings = (stream.landings || [])
    .filter(l => !bannedLanderId || String(l.id) !== String(bannedLanderId))
    .map(l => String(l.id) === String(nextLanderId) ? { ...l, weight: 100 } : { ...l, weight: 1 });

  await putStream(apiKey, streamId, { ...stream, landings: updatedLandings });
  console.log(`[rotator] RT stream ${streamId}: removed ${bannedLanderId}, ${nextLanderId} → weight 100`);
}

// Add a lander to a stream at the given weight (if not already present)
async function ensureLanderInStream(streamId, rtLanderId, weight = 1) {
  const apiKey = process.env.REDTRACK_API_KEY;
  if (!apiKey || !streamId || !rtLanderId) return;

  try {
    const stream = await fetchStream(apiKey, streamId);
    if (!stream) return;

    const already = (stream.landings || []).find(l => String(l.id) === String(rtLanderId));
    if (already) return; // already in stream

    const updatedLandings = [...(stream.landings || []), { id: rtLanderId, weight }];
    await putStream(apiKey, streamId, { ...stream, landings: updatedLandings });
    console.log(`[rotator] RT stream ${streamId}: added lander ${rtLanderId} at weight ${weight}`);
  } catch (err) {
    console.error('[rotator] ensureLanderInStream failed:', err.message);
  }
}

// ── Main rotation ─────────────────────────────────────────────────────────────

async function rotate(bannedDomain, triggerSource = 'api') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [fromDomain] } = await client.query(
      `SELECT d.*, f.redtrack_stream_id
       FROM domains d
       LEFT JOIN funnels f ON d.funnel_id = f.id
       WHERE d.domain = $1`,
      [bannedDomain]
    );

    if (!fromDomain) throw new Error(`Domain not found: ${bannedDomain}`);
    if (fromDomain.status === 'banned') throw new Error(`Domain already banned: ${bannedDomain}`);

    const wasActive = fromDomain.status === 'active';

    await client.query(
      `UPDATE domains SET status = 'banned', banned_at = NOW() WHERE id = $1`,
      [fromDomain.id]
    );

    if (!wasActive) {
      await client.query('COMMIT');
      return { fromDomain: bannedDomain, toDomain: null, action: 'banned_only' };
    }

    // Prefer standby domains that already have an RT lander in the stream (weight=1)
    const nextQuery = fromDomain.funnel_id
      ? await client.query(
          `SELECT * FROM domains WHERE status = 'standby' AND funnel_id = $1
           ORDER BY (redtrack_lander_id IS NOT NULL) DESC, priority DESC, added_at ASC LIMIT 1`,
          [fromDomain.funnel_id]
        )
      : await client.query(
          `SELECT * FROM domains WHERE status = 'standby' AND funnel_id IS NULL
           ORDER BY (redtrack_lander_id IS NOT NULL) DESC, priority DESC, added_at ASC LIMIT 1`
        );

    const nextDomain = nextQuery.rows[0];

    if (!nextDomain) {
      await client.query(
        `INSERT INTO rotation_history (funnel_id, from_domain, to_domain, lander_name, trigger_source, status, error)
         VALUES ($1, $2, 'N/A', null, $3, 'failed', 'No standby domains available')`,
        [fromDomain.funnel_id || null, bannedDomain, triggerSource]
      );
      await client.query('COMMIT');
      throw new Error('No standby domains available');
    }

    const landerId = nextDomain.lander_id || fromDomain.lander_id;
    let lander = null;

    if (landerId) {
      const { rows: [l] } = await client.query(`SELECT * FROM landers WHERE id = $1`, [landerId]);
      lander = l || null;
      // Only deploy files if lander hasn't been published to RT yet
      if (l && !nextDomain.redtrack_lander_id) {
        await uploadLander(path.join(LANDERS_DIR, l.folder), nextDomain.doc_root);
      }
    }

    await client.query(
      `UPDATE domains SET status = 'active', lander_id = $1 WHERE id = $2`,
      [landerId || null, nextDomain.id]
    );

    const { rows: [histRow] } = await client.query(
      `INSERT INTO rotation_history (funnel_id, from_domain, to_domain, lander_name, trigger_source, status)
       VALUES ($1, $2, $3, $4, $5, 'success') RETURNING id`,
      [fromDomain.funnel_id || null, bannedDomain, nextDomain.domain, lander?.name || null, triggerSource]
    );

    await client.query('COMMIT');

    // RT weight-based rotation: remove banned lander, promote next to weight 100
    let rtWarning = null;
    if (fromDomain.redtrack_stream_id && nextDomain.redtrack_lander_id) {
      try {
        await rotateInStream(
          fromDomain.redtrack_stream_id,
          fromDomain.redtrack_lander_id,
          nextDomain.redtrack_lander_id
        );
      } catch (err) {
        rtWarning = err.message;
        console.error('[rotator] RT weight rotation failed after DB rotation:', err.message);
      }
    }

    return {
      fromDomain: bannedDomain,
      toDomain: nextDomain.domain,
      lander: lander?.name || null,
      historyId: histRow.id,
      rtUpdated: !rtWarning && !!(fromDomain.redtrack_stream_id && nextDomain.redtrack_lander_id),
      rtWarning,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    pool.query(
      `INSERT INTO rotation_history (from_domain, to_domain, lander_name, trigger_source, status, error)
       VALUES ($1, 'failed', null, $2, 'failed', $3)`,
      [bannedDomain, triggerSource, err.message]
    ).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { rotate, ensureLanderInStream };
