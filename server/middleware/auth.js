const jwt = require('jsonwebtoken');
const { ADMIN_EMAIL } = require('../config/admin');
const pool = require('../db/pool');
const { SESSION_COOKIE } = require('../controllers/authController');

function readCookie(req, name) {
  const prefix = `${name}=`;
  const cookie = (req.get('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!cookie) return '';
  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return '';
  }
}

async function requireAuth(req, res, next) {
  const bearer = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const token = readCookie(req, SESSION_COOKIE) || bearer;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
  if (!payload.sid) return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  try {
    const result = await pool.query(
      'SELECT u.id, u.name, u.email, u.role, u.is_active, s.id AS session_id FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND u.id = $2 AND s.expires_at > NOW()',
      [payload.sid, payload.id]
    );
    if (!result.rowCount || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'This session is no longer active.' });
    }
    req.user = { ...result.rows[0], sessionId: result.rows[0].session_id };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role === 'admin' && req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'This administrator identity is not authorized for Firebase access.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    return next();
  };
}

module.exports = { requireAuth, requireRole };
