const express = require('express');
const axios   = require('axios');

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

// Normalize a stream object: ensure .id is always set regardless of _id vs id
function normalizeStream(s) {
  if (!s) return s;
  return { ...s, id: s.id || s._id };
}

// Funnel templates — always request a large page to avoid pagination gaps
async function fetchAllStreams() {
  const data = await rt('/streams?template=true&per=500');
  return (data.items || data || []).map(normalizeStream);
}

router.get('/streams', async (req, res) => {
  try {
    const items = await fetchAllStreams();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/streams/:id', async (req, res) => {
  try {
    // RT API has no single-stream GET — fetch the list and find by id or _id
    const items = await fetchAllStreams();
    const stream = items.find(s => String(s.id) === req.params.id || String(s._id) === req.params.id);
    if (!stream) {
      console.error(`[redtrack] stream ${req.params.id} not found. Available IDs:`, items.map(s => s.id || s._id));
      return res.status(404).json({ message: `Stream ${req.params.id} not found in list` });
    }
    console.log('[redtrack] stream keys:', Object.keys(stream));
    console.log('[redtrack] landings:', JSON.stringify(stream?.landings?.slice(0, 2)));
    console.log('[redtrack] offers:', JSON.stringify(stream?.offers?.slice(0, 2)));
    res.json(stream);
  } catch (err) {
    console.error('[redtrack] stream fetch error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ message: err.response?.data?.error || err.message });
  }
});

router.post('/landings', async (req, res) => {
  const key = process.env.REDTRACK_API_KEY;
  if (!key) return res.status(500).json({ message: 'REDTRACK_API_KEY not configured' });
  try {
    const { data } = await axios.post(
      'https://api.redtrack.io/landings',
      req.body,
      { params: { api_key: key }, timeout: 10000 }
    );
    res.status(201).json(data);
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    res.status(err.response?.status || 500).json({ message: msg });
  }
});

router.put('/streams/:id', async (req, res) => {
  const key = process.env.REDTRACK_API_KEY;
  if (!key) return res.status(500).json({ message: 'REDTRACK_API_KEY not configured' });
  try {
    const { type: _ignored, ...rest } = req.body;
    const payload = { ...rest, template: true };
    const { data } = await axios.put(
      `https://api.redtrack.io/streams/${req.params.id}`,
      payload,
      { params: { api_key: key }, timeout: 10000 }
    );
    res.json(normalizeStream(data));
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    res.status(err.response?.status || 500).json({ message: msg });
  }
});

router.post('/streams', async (req, res) => {
  const key = process.env.REDTRACK_API_KEY;
  if (!key) return res.status(500).json({ message: 'REDTRACK_API_KEY not configured' });
  try {
    // Strip our internal 'type' UI field; add template:true so RT treats it as a funnel template
    const { type: _ignored, ...rest } = req.body;
    const payload = { ...rest, template: true };
    console.log('[redtrack] POST /streams payload:', JSON.stringify(payload));

    const { data } = await axios.post(
      'https://api.redtrack.io/streams',
      payload,
      { params: { api_key: key }, timeout: 10000 }
    );
    console.log('[redtrack] POST /streams response:', JSON.stringify(data));

    const normalized = normalizeStream(data);
    if (!normalized?.id) {
      console.error('[redtrack] POST /streams: no id in response', data);
      return res.status(500).json({ message: 'RedTrack did not return a stream ID. Check Railway logs.' });
    }
    res.status(201).json(normalized);
  } catch (err) {
    console.error('[redtrack] POST /streams error:', err.response?.status, JSON.stringify(err.response?.data));
    const msg = err.response?.data?.error || err.response?.data?.message || err.message;
    res.status(err.response?.status || 500).json({ message: msg });
  }
});

module.exports = { router, rt };
