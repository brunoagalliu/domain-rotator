const path = require('path');
const axios = require('axios');
const { pool } = require('./db');
const { uploadLander } = require('./cpanel');

const LANDERS_DIR = path.join(__dirname, '../landers');

async function updateRedTrackStream(streamId, oldLanderId, newLanderId) {
  const apiKey = process.env.REDTRACK_API_KEY;
  if (!apiKey || !streamId || !oldLanderId || !newLanderId) return;

  const { data: list } = await axios.get(
    'https://api.redtrack.io/streams',
    { params: { api_key: apiKey, template: true, per: 500 }, timeout: 10000 }
  );
  const items = (list.items || list || []).map(s => ({ ...s, id: s.id || s._id }));
  const stream = items.find(s => String(s.id || s._id) === String(streamId));
  if (!stream) throw new Error(`Stream ${streamId} not found in RT`);

  let changed = false;
  for (const landing of stream.landings || []) {
    if (String(landing.id) === String(oldLanderId)) {
      landing.id = newLanderId;
      changed = true;
    }
  }

  if (!changed) throw new Error(`Landing ${oldLanderId} not found in stream ${streamId}`);

  await axios.put(
    `https://api.redtrack.io/streams/${streamId}`,
    stream,
    { params: { api_key: apiKey }, timeout: 10000 }
  );
  console.log(`[rotator] RT stream ${streamId} updated: ${oldLanderId} → ${newLanderId}`);
}

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

    // Prefer standby domains that already have an RT lander published (ready for stream swap)
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

    // Only deploy lander files if the next domain hasn't been published to RT yet
    // (publishing to RT implies files are already deployed)
    if (landerId) {
      const { rows: [l] } = await client.query(`SELECT * FROM landers WHERE id = $1`, [landerId]);
      lander = l || null;
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

    // RT stream swap — awaited, errors surface as a warning (DB already committed)
    let rtWarning = null;
    if (fromDomain.redtrack_stream_id && fromDomain.redtrack_lander_id && nextDomain.redtrack_lander_id) {
      try {
        await updateRedTrackStream(
          fromDomain.redtrack_stream_id,
          fromDomain.redtrack_lander_id,
          nextDomain.redtrack_lander_id
        );
      } catch (err) {
        rtWarning = err.message;
        console.error('[rotator] RT stream update failed after DB rotation:', err.message);
      }
    }

    return {
      fromDomain: bannedDomain,
      toDomain: nextDomain.domain,
      lander: lander?.name || null,
      historyId: histRow.id,
      rtUpdated: !rtWarning && !!(fromDomain.redtrack_stream_id && fromDomain.redtrack_lander_id && nextDomain.redtrack_lander_id),
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

module.exports = { rotate };
