const express = require('express');
const path = require('path');
const { pool } = require('../db');
const { uploadLander } = require('../cpanel');

const LANDERS_DIR = path.join(__dirname, '../../landers');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, l.name AS lander_name, f.name AS funnel_name
      FROM domains d
      LEFT JOIN landers l ON d.lander_id = l.id
      LEFT JOIN funnels f ON d.funnel_id = f.id
      ORDER BY
        CASE d.status WHEN 'active' THEN 0 WHEN 'standby' THEN 1 ELSE 2 END,
        d.priority DESC,
        d.added_at ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  const {
    domain, doc_root, status = 'standby', lander_id,
    funnel_id, role = 'backup', redtrack_lander_id,
    priority = 0, notes, category,
  } = req.body;
  if (!domain || !doc_root) {
    return res.status(400).json({ message: 'domain and doc_root are required.' });
  }
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO domains (domain, doc_root, status, lander_id, funnel_id, role, redtrack_lander_id, priority, notes, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        domain.toLowerCase().trim(), doc_root.trim(), status,
        lander_id || null, funnel_id || null, role,
        redtrack_lander_id || null, priority, notes || null, category || null,
      ]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Domain already exists.' });
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const allowed = [
    'domain', 'doc_root', 'status', 'lander_id',
    'funnel_id', 'role', 'redtrack_lander_id',
    'priority', 'notes', 'banned_at', 'category',
  ];
  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (key in req.body) {
      fields.push(`${key} = $${idx++}`);
      values.push(req.body[key] ?? null);
    }
  }

  if (fields.length === 0) return res.status(400).json({ message: 'No fields to update.' });
  values.push(req.params.id);

  try {
    const { rows: [row] } = await pool.query(
      `UPDATE domains SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!row) return res.status(404).json({ message: 'Not found.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM domains WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/deploy', async (req, res) => {
  try {
    const { rows: [domain] } = await pool.query(
      `SELECT d.*, l.folder AS lander_folder
       FROM domains d
       LEFT JOIN landers l ON d.lander_id = l.id
       WHERE d.id = $1`,
      [req.params.id]
    );

    if (!domain) return res.status(404).json({ message: 'Domain not found.' });
    if (!domain.lander_folder) return res.status(400).json({ message: 'No lander assigned to this domain.' });

    const landerPath = path.join(LANDERS_DIR, domain.lander_folder);
    await uploadLander(landerPath, domain.doc_root);

    res.json({ ok: true, domain: domain.domain });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Domain Landers (multiple landers per domain) ─────────────────────────────

router.get('/:id/landers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT dl.*, l.name AS lander_name, l.folder AS lander_folder
       FROM domain_landers dl
       JOIN landers l ON dl.lander_id = l.id
       WHERE dl.domain_id = $1
       ORDER BY dl.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/landers', async (req, res) => {
  const { lander_id, subdirectory = '' } = req.body;
  if (!lander_id) return res.status(400).json({ message: 'lander_id is required.' });
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO domain_landers (domain_id, lander_id, subdirectory)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, lander_id, subdirectory.trim().replace(/^\/|\/$/g, '')]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'A lander is already assigned to that path.' });
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/landers/:dlId', async (req, res) => {
  const { redtrack_lander_id } = req.body;
  try {
    const { rows: [dl] } = await pool.query(
      `UPDATE domain_landers SET redtrack_lander_id = $1 WHERE id = $2 AND domain_id = $3 RETURNING *`,
      [redtrack_lander_id || null, req.params.dlId, req.params.id]
    );
    if (!dl) return res.status(404).json({ message: 'Not found.' });

    // If root path, keep the domain's own redtrack_lander_id in sync
    if (!dl.subdirectory) {
      await pool.query(
        `UPDATE domains SET redtrack_lander_id = $1 WHERE id = $2`,
        [redtrack_lander_id || null, req.params.id]
      );
    }
    res.json(dl);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id/landers/:dlId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM domain_landers WHERE id = $1 AND domain_id = $2`,
      [req.params.dlId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Deploy a specific domain-lander to cPanel
router.post('/:id/landers/:dlId/deploy', async (req, res) => {
  try {
    const { rows: [dl] } = await pool.query(
      `SELECT dl.*, l.folder AS lander_folder, d.doc_root, d.domain
       FROM domain_landers dl
       JOIN landers l ON dl.lander_id = l.id
       JOIN domains d ON dl.domain_id = d.id
       WHERE dl.id = $1 AND dl.domain_id = $2`,
      [req.params.dlId, req.params.id]
    );
    if (!dl) return res.status(404).json({ message: 'Not found.' });

    const targetRoot = dl.subdirectory
      ? `${dl.doc_root}/${dl.subdirectory}`
      : dl.doc_root;

    await uploadLander(path.join(LANDERS_DIR, dl.lander_folder), targetRoot);
    res.json({ ok: true, domain: dl.domain, path: dl.subdirectory || '/' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Deploy + publish to RedTrack as a landing page
// Create RT landing page only (no cPanel deploy — use /deploy for that)
router.post('/:id/landers/:dlId/publish', async (req, res) => {
  const axios = require('axios');
  try {
    const { rows: [dl] } = await pool.query(
      `SELECT dl.*, l.name AS lander_name, d.domain
       FROM domain_landers dl
       JOIN landers l ON dl.lander_id = l.id
       JOIN domains d ON dl.domain_id = d.id
       WHERE dl.id = $1 AND dl.domain_id = $2`,
      [req.params.dlId, req.params.id]
    );
    if (!dl) return res.status(404).json({ message: 'Not found.' });

    const defaultUrl = dl.subdirectory
      ? `https://${dl.domain}/${dl.subdirectory}`
      : `https://${dl.domain}`;
    const defaultTitle = `${dl.lander_name} - ${dl.domain}${dl.subdirectory ? '/' + dl.subdirectory : ''}`;

    const { title = defaultTitle, url = defaultUrl, type = 'l' } = req.body;

    const apiKey = process.env.REDTRACK_API_KEY;
    if (!apiKey) return res.status(500).json({ message: 'REDTRACK_API_KEY not configured.' });

    const { data: rtLander } = await axios.post(
      'https://api.redtrack.io/landings',
      { title, url, type },
      { params: { api_key: apiKey }, timeout: 10000 }
    );

    await pool.query(
      `UPDATE domain_landers SET redtrack_lander_id = $1 WHERE id = $2`,
      [rtLander.id, dl.id]
    );

    if (!dl.subdirectory) {
      await pool.query(
        `UPDATE domains SET redtrack_lander_id = $1 WHERE id = $2`,
        [rtLander.id, req.params.id]
      );
    }

    res.json({ ok: true, redtrack_lander: rtLander });
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    res.status(500).json({ message: msg });
  }
});

module.exports = router;
