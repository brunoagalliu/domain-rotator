const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
  const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'admin';

  if (!password || password !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ message: 'Invalid password.' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

module.exports = router;
