const express = require('express');
const { pool } = require('../db');
const { rt } = require('./redtrack');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        f.*,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status != 'banned') AS domain_count,
        COUNT(DISTINCT d.id) FILTER (WHERE d.role = 'primary' AND d.status = 'active') AS is_active,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'standby') AS standby_count,
        COUNT(DISTINCT fo.id) AS offer_count
      FROM funnels f
      LEFT JOIN domains d  ON d.funnel_id = f.id
      LEFT JOIN funnel_offers fo ON fo.funnel_id = f.id
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows: [funnel] } = await pool.query(
      `SELECT * FROM funnels WHERE id = $1`, [req.params.id]
    );
    if (!funnel) return res.status(404).json({ message: 'Not found.' });

    const { rows: domains } = await pool.query(
      `SELECT * FROM domains WHERE funnel_id = $1 ORDER BY role DESC, priority DESC, added_at ASC`,
      [req.params.id]
    );
    const { rows: offers } = await pool.query(
      `SELECT * FROM funnel_offers WHERE funnel_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({ ...funnel, domains, offers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, redtrack_stream_id } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required.' });
  try {
    const { rows: [funnel] } = await pool.query(
      `INSERT INTO funnels (name, redtrack_stream_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), redtrack_stream_id || null]
    );
    res.status(201).json(funnel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const { name, redtrack_stream_id, category } = req.body;
  const fields = [];
  const values = [];
  if (name !== undefined)               { fields.push(`name = $${fields.length + 1}`);               values.push(name || null); }
  if (redtrack_stream_id !== undefined) { fields.push(`redtrack_stream_id = $${fields.length + 1}`); values.push(redtrack_stream_id || null); }
  if (category !== undefined)           { fields.push(`category = $${fields.length + 1}`);           values.push(category || null); }
  if (fields.length === 0) return res.status(400).json({ message: 'No fields to update.' });
  values.push(req.params.id);
  try {
    const { rows: [funnel] } = await pool.query(
      `UPDATE funnels SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!funnel) return res.status(404).json({ message: 'Not found.' });
    res.json(funnel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM funnels WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get or create a funnel linked to a RedTrack stream
router.post('/by-stream', async (req, res) => {
  const { redtrack_stream_id, title } = req.body;
  if (!redtrack_stream_id) return res.status(400).json({ message: 'redtrack_stream_id is required.' });
  try {
    const { rows: [funnel] } = await pool.query(
      `INSERT INTO funnels (name, redtrack_stream_id)
       VALUES ($1, $2)
       ON CONFLICT (redtrack_stream_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [title || redtrack_stream_id, redtrack_stream_id]
    );
    res.json(funnel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Import funnel from a RedTrack funnel template (stream)
router.post('/import', async (req, res) => {
  const { redtrack_stream_id } = req.body;
  if (!redtrack_stream_id) {
    return res.status(400).json({ message: 'redtrack_stream_id is required.' });
  }

  let stream;
  try {
    stream = await rt(`/streams/${redtrack_stream_id}`);
  } catch (err) {
    return res.status(502).json({ message: `RedTrack fetch failed: ${err.message}` });
  }

  // Collect unique offers from the funnel template
  const seen = new Set();
  const offers = [];
  for (const o of stream.offers || []) {
    if (!seen.has(o.id)) {
      seen.add(o.id);
      offers.push({ id: o.id, name: o.name, weight: o.weight || 100 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [funnel] } = await client.query(
      `INSERT INTO funnels (name, redtrack_stream_id) VALUES ($1, $2) RETURNING *`,
      [stream.title, redtrack_stream_id]
    );

    for (const o of offers) {
      await client.query(
        `INSERT INTO funnel_offers (funnel_id, redtrack_offer_id, offer_title, weight)
         VALUES ($1, $2, $3, $4)`,
        [funnel.id, o.id, o.name, o.weight]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...funnel, offers_imported: offers.length });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ message: 'This campaign is already imported as a funnel.' });
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// Update a single lander's weight in the RT stream
router.patch('/:id/lander-weight', async (req, res) => {
  const axios = require('axios');
  const { rt_lander_id, weight } = req.body;
  if (!rt_lander_id || weight == null) return res.status(400).json({ message: 'rt_lander_id and weight required.' });

  try {
    const { rows: [funnel] } = await pool.query(`SELECT * FROM funnels WHERE id = $1`, [req.params.id]);
    if (!funnel) return res.status(404).json({ message: 'Funnel not found.' });
    if (!funnel.redtrack_stream_id) return res.status(400).json({ message: 'Funnel not linked to RT stream.' });

    const apiKey = process.env.REDTRACK_API_KEY;
    if (!apiKey) return res.status(500).json({ message: 'REDTRACK_API_KEY not configured.' });

    const { data: list } = await axios.get('https://api.redtrack.io/streams', {
      params: { api_key: apiKey, template: true, per: 500 },
      timeout: 10000,
    });
    const items = (list.items || list || []).map(s => ({ ...s, id: s.id || s._id }));
    const stream = items.find(s => String(s.id) === String(funnel.redtrack_stream_id));
    if (!stream) return res.status(404).json({ message: 'RT stream not found.' });

    // Block weight increase on banned domains
    const { rows: [banned] } = await pool.query(
      `SELECT id FROM domains WHERE redtrack_lander_id = $1 AND status = 'banned' LIMIT 1`,
      [String(rt_lander_id)]
    );
    if (banned) return res.status(400).json({ message: 'Domain is banned — remove it from the stream instead.' });

    const updatedLandings = (stream.landings || []).map(l =>
      String(l.id) === String(rt_lander_id) ? { ...l, weight: Number(weight) } : l
    );

    await axios.put(
      `https://api.redtrack.io/streams/${funnel.redtrack_stream_id}`,
      { ...stream, landings: updatedLandings },
      { params: { api_key: apiKey }, timeout: 10000 }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.response?.data?.error || err.message });
  }
});

// Remove a lander from the RT stream entirely
router.delete('/:id/stream-lander/:rtLanderId', async (req, res) => {
  const axios = require('axios');
  try {
    const { rows: [funnel] } = await pool.query(`SELECT * FROM funnels WHERE id = $1`, [req.params.id]);
    if (!funnel?.redtrack_stream_id) return res.status(404).json({ message: 'Funnel or stream not found.' });

    const apiKey = process.env.REDTRACK_API_KEY;
    if (!apiKey) return res.status(500).json({ message: 'REDTRACK_API_KEY not configured.' });

    const { data: list } = await axios.get('https://api.redtrack.io/streams', {
      params: { api_key: apiKey, template: true, per: 500 },
      timeout: 10000,
    });
    const items = (list.items || list || []).map(s => ({ ...s, id: s.id || s._id }));
    const stream = items.find(s => String(s.id) === String(funnel.redtrack_stream_id));
    if (!stream) return res.status(404).json({ message: 'RT stream not found.' });

    const updatedLandings = (stream.landings || []).filter(
      l => String(l.id) !== String(req.params.rtLanderId)
    );

    await axios.put(
      `https://api.redtrack.io/streams/${funnel.redtrack_stream_id}`,
      { ...stream, landings: updatedLandings },
      { params: { api_key: apiKey }, timeout: 10000 }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.response?.data?.error || err.message });
  }
});

// Offers
router.post('/:id/offers', async (req, res) => {
  const { redtrack_offer_id, offer_title, weight = 100 } = req.body;
  if (!redtrack_offer_id || !offer_title) {
    return res.status(400).json({ message: 'redtrack_offer_id and offer_title are required.' });
  }
  try {
    const { rows: [offer] } = await pool.query(
      `INSERT INTO funnel_offers (funnel_id, redtrack_offer_id, offer_title, weight)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, redtrack_offer_id, offer_title, weight]
    );
    res.status(201).json(offer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/offers/:offerId', async (req, res) => {
  const { weight } = req.body;
  try {
    const { rows: [offer] } = await pool.query(
      `UPDATE funnel_offers SET weight = $1 WHERE id = $2 AND funnel_id = $3 RETURNING *`,
      [weight, req.params.offerId, req.params.id]
    );
    if (!offer) return res.status(404).json({ message: 'Not found.' });
    res.json(offer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id/offers/:offerId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM funnel_offers WHERE id = $1 AND funnel_id = $2`,
      [req.params.offerId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
