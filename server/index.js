require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { init: initDb } = require('./db');
const { start: startMonitor } = require('./monitor');
const authRouter = require('./routes/auth');
const domainsRouter = require('./routes/domains');
const landersRouter = require('./routes/landers');
const rotateRouter = require('./routes/rotate');
const historyRouter = require('./routes/history');
const monitorRouter = require('./routes/monitor');

// Ensure landers dirs exist
const LANDERS_DIR = path.join(__dirname, '../landers');
fs.mkdirSync(path.join(LANDERS_DIR, '_tmp'), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const API_KEY = process.env.API_KEY;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
}));
app.use(express.json());

// Public — login only
app.use('/api/auth', authRouter);

// Auth middleware: accepts JWT (dashboard) or API key (detection tool)
app.use('/api', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (API_KEY && apiKey === API_KEY) return next();

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

app.use('/api/domains', domainsRouter);
app.use('/api/landers', landersRouter);
app.use('/api/rotate', rotateRouter);
app.use('/api/history', historyRouter);
app.use('/api/monitor', monitorRouter);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

initDb()
  .then(() => {
    startMonitor();
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('DB init failed:', err.message);
    process.exit(1);
  });
