const path = require('path');
const { pool } = require('./db');
const { uploadLander } = require('./cpanel');

const LANDERS_DIR = path.join(__dirname, '../landers');

async function rotate(bannedDomain, triggerSource = 'api') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find the domain being reported
    const { rows: [fromDomain] } = await client.query(
      `SELECT * FROM domains WHERE domain = $1`,
      [bannedDomain]
    );

    if (!fromDomain) throw new Error(`Domain not found in pool: ${bannedDomain}`);
    if (fromDomain.status === 'banned') throw new Error(`Domain already banned: ${bannedDomain}`);

    const wasActive = fromDomain.status === 'active';

    // Mark as banned
    await client.query(
      `UPDATE domains SET status = 'banned', banned_at = NOW() WHERE id = $1`,
      [fromDomain.id]
    );

    // If it wasn't the active domain, just ban it — no rotation needed
    if (!wasActive) {
      await client.query('COMMIT');
      return { fromDomain: bannedDomain, toDomain: null, action: 'banned_only' };
    }

    // Find next standby (highest priority first, then oldest)
    const { rows: [nextDomain] } = await client.query(
      `SELECT * FROM domains WHERE status = 'standby' ORDER BY priority DESC, added_at ASC LIMIT 1`
    );

    if (!nextDomain) {
      await client.query(
        `INSERT INTO rotation_history (from_domain, to_domain, lander_name, trigger_source, status, error)
         VALUES ($1, 'N/A', null, $2, 'failed', 'No standby domains available')`,
        [bannedDomain, triggerSource]
      );
      await client.query('COMMIT');
      throw new Error('No standby domains available in pool');
    }

    // Determine lander: prefer standby's own lander, fall back to banned domain's
    const landerId = nextDomain.lander_id || fromDomain.lander_id;
    if (!landerId) throw new Error('No lander assigned to this domain or its standby');

    const { rows: [lander] } = await client.query(
      `SELECT * FROM landers WHERE id = $1`, [landerId]
    );
    if (!lander) throw new Error(`Lander id ${landerId} not found`);

    const landerFolder = path.join(LANDERS_DIR, lander.folder);

    // Upload lander files to the new domain via cPanel
    await uploadLander(landerFolder, nextDomain.doc_root);

    // Promote standby → active
    await client.query(
      `UPDATE domains SET status = 'active', lander_id = $1 WHERE id = $2`,
      [landerId, nextDomain.id]
    );

    // Log success
    const { rows: [histRow] } = await client.query(
      `INSERT INTO rotation_history (from_domain, to_domain, lander_name, trigger_source, status)
       VALUES ($1, $2, $3, $4, 'success') RETURNING id`,
      [bannedDomain, nextDomain.domain, lander.name, triggerSource]
    );

    await client.query('COMMIT');
    return {
      fromDomain: bannedDomain,
      toDomain: nextDomain.domain,
      lander: lander.name,
      historyId: histRow.id,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    // Log the failure (best-effort, outside the rolled-back transaction)
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
