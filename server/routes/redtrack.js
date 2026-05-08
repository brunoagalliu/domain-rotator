const express = require('express');
const axios = require('axios');

const router = express.Router();
const BASE = 'https://api.redtrack.io';

async function rt(path) {
  const key = process.env.REDTRACK_API_KEY;
  if (!key) throw new Error('REDTRACK_API_KEY not configured');
  const { data } = await axios.get(`${BASE}${path}`, {
    params: { api_key: key },
    timeout: 10000,
  });
  return data;
}

router.get('/landings', async (req, res) => {
  try {
    const data = await rt('/landings');
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/offers', async (req, res) => {
  try {
    const data = await rt('/offers');
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/campaigns', async (req, res) => {
  try {
    const data = await rt('/campaigns');
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Funnel templates
router.get('/streams', async (req, res) => {
  try {
    const data = await rt('/streams');
    res.json(data.items || data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/streams/:id', async (req, res) => {
  try {
    const data = await rt(`/streams/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = { router, rt };
