require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const pool = require('./db/pool');

const app = express();
app.disable('x-powered-by');
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: clientOrigin,
  credentials: true,
}));
app.use((req, res, next) => {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const origin = req.get('origin');
  if (isMutation && origin && origin !== clientOrigin) {
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  return next();
});
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok' });
  } catch (error) {
    return next(error);
  }
});
app.use((err, _req, res, _next) => {
  console.error(err);
  if (['ECONNREFUSED', 'ENOTFOUND', '28P01', '3D000'].includes(err.code)) {
    return res.status(503).json({ error: 'Database is not ready. Check DATABASE_URL and verify PostgreSQL is running.' });
  }
  res.status(500).json({ error: 'Internal server error.' });
});

const port = Number(process.env.PORT || 3000);
if (!process.env.DATABASE_URL) {
  throw new Error('Set DATABASE_URL in server/.env and make sure PostgreSQL is running.');
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /replace|change.?me/i.test(process.env.JWT_SECRET)) {
  throw new Error('Set JWT_SECRET to a private random value with at least 32 characters.');
}
app.listen(port, () => console.log(`Brightloop API listening on http://localhost:${port}`));
