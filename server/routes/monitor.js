const express = require('express');
const { getState, setPaused } = require('../monitor');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(getState());
});

router.post('/toggle', (req, res) => {
  const current = getState();
  setPaused(!current.paused);
  res.json(getState());
});

module.exports = router;
