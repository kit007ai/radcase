const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rate-limit');
const JWT_SECRET = require('../lib/jwt-secret');

const router = express.Router();

const authRateLimit = createRateLimiter({ maxRequests: 10, windowMs: 60 * 1000 });

module.exports = function(db) {
  // Register new user
  router.post('/register', authRateLimit, async (req, res) => {
    const { username, email, password, displayName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    // Check if username exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Check if email exists (if provided)
    if (email) {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    const traineeLevel = req.body.traineeLevel || 'resident';
    const validLevels = ['student', 'resident', 'fellow', 'attending'];
    const level = validLevels.includes(traineeLevel) ? traineeLevel : 'resident';

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, display_name, trainee_level)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, username.toLowerCase(), email || null, passwordHash, displayName || username, level);

    // Generate token
    const token = jwt.sign({ id, username: username.toLowerCase(), displayName: displayName || username, traineeLevel: level }, JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
      success: true,
      user: { id, username: username.toLowerCase(), displayName: displayName || username, traineeLevel: level }
    });
  });

  // Login
  router.post('/login', authRateLimit, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), username.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Generate token
    const token = jwt.sign({
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      role: user.role,
      traineeLevel: user.trainee_level || 'resident'
    }, JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        role: user.role,
        traineeLevel: user.trainee_level || 'resident'
      }
    });
  });

  // Logout
  router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
  });

  // Get current user
  router.get('/me', (req, res) => {
    if (!req.user) {
      return res.json({ user: null });
    }

    const user = db.prepare('SELECT id, username, email, display_name, role, trainee_level, created_at FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      res.clearCookie('token');
      return res.json({ user: null });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        traineeLevel: user.trainee_level || 'resident',
        createdAt: user.created_at
      }
    });
  });

  // Update trainee level
  router.put('/trainee-level', requireAuth, (req, res) => {
    const { traineeLevel } = req.body;
    const validLevels = ['student', 'resident', 'fellow', 'attending'];
    if (!validLevels.includes(traineeLevel)) {
      return res.status(400).json({ error: 'Invalid trainee level. Must be: student, resident, fellow, or attending' });
    }

    db.prepare('UPDATE users SET trainee_level = ? WHERE id = ?').run(traineeLevel, req.user.id);

    // Issue new JWT with updated trainee level
    const user = db.prepare('SELECT id, username, display_name, role, trainee_level FROM users WHERE id = ?').get(req.user.id);
    const token = jwt.sign({
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      role: user.role,
      traineeLevel: user.trainee_level
    }, JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, traineeLevel: user.trainee_level });
  });

  return router;
};
