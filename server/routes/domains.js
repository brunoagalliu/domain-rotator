const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, l.name AS lander_name
      FROM domains d
      LEFT JOIN landers l ON d.lander_id = l.id
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
  const { domain, doc_root, status = 'standby', lander_id, priority = 0, notes } = req.body;
  if (!domain || !doc_root) {
    return res.status(400).json({ message: 'domain and doc_root are required.' });
  }
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO domains (domain, doc_root, status, lander_id, priority, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [domain.toLowerCase().trim(), doc_root.trim(), status, lander_id || null, priority, notes || null]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Domain already exists.' });
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const allowed = ['domain', 'doc_root', 'status', 'lander_id', 'priority', 'notes', 'banned_at'];
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

module.exports = router;
