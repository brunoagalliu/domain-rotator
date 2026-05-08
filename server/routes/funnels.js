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
  const { name, redtrack_campaign_id } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required.' });
  try {
    const { rows: [funnel] } = await pool.query(
      `INSERT INTO funnels (name, redtrack_campaign_id) VALUES ($1, $2) RETURNING *`,
      [name.trim(), redtrack_campaign_id || null]
    );
    res.status(201).json(funnel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  const { name, redtrack_campaign_id } = req.body;
  try {
    const { rows: [funnel] } = await pool.query(
      `UPDATE funnels SET
        name                 = COALESCE($1, name),
        redtrack_campaign_id = COALESCE($2, redtrack_campaign_id)
       WHERE id = $3 RETURNING *`,
      [name || null, redtrack_campaign_id || null, req.params.id]
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

// Import funnel from a RedTrack campaign
router.post('/import', async (req, res) => {
  const { redtrack_campaign_id } = req.body;
  if (!redtrack_campaign_id) {
    return res.status(400).json({ message: 'redtrack_campaign_id is required.' });
  }

  let campaign;
  try {
    campaign = await rt(`/campaigns/${redtrack_campaign_id}`);
  } catch (err) {
    return res.status(502).json({ message: `RedTrack fetch failed: ${err.message}` });
  }

  // Collect unique offers from all streams
  const seen = new Set();
  const offers = [];
  for (const sw of campaign.streams || []) {
    for (const o of sw.stream?.offers || []) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        offers.push({ id: o.id, name: o.name, weight: o.weight || 100 });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [funnel] } = await client.query(
      `INSERT INTO funnels (name, redtrack_campaign_id) VALUES ($1, $2) RETURNING *`,
      [campaign.title, redtrack_campaign_id]
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
