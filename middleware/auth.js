const jwt = require('jsonwebtoken');

const JWT_SECRET = require('../lib/jwt-secret');

// Auth middleware - extracts user from token, doesn't block if missing
function authMiddleware(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (e) {
      // Invalid token, continue as guest
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

// Require auth middleware - blocks if not authenticated
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

module.exports = { authMiddleware, requireAuth };
