const express = require('express');
const { getState } = require('../monitor');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(getState());
});

module.exports = router;
