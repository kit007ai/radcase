const express = require('express');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
const { requireAuth } = require('../middleware/auth');
const JWT_SECRET = require('../lib/jwt-secret');
const { updateSpacedRepetition } = require('./quiz');

const router = express.Router();

module.exports = function(db, VAPID_PUBLIC_KEY) {
  // VAPID public key endpoint (no auth required for subscription flow)
  router.get('/push/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  // Push notification subscription (PWA) - persist to database
  router.post('/push-subscription', requireAuth, (req, res) => {
    const { subscription, userAgent } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Valid subscription data required' });
    }

    const { endpoint, keys } = subscription;
    if (!keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Subscription keys (p256dh, auth) required' });
    }

    try {
      db.prepare(`
        INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth, user_agent)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          user_id = excluded.user_id,
          keys_p256dh = excluded.keys_p256dh,
          keys_auth = excluded.keys_auth,
          user_agent = excluded.user_agent,
          created_at = CURRENT_TIMESTAMP
      `).run(req.user.id, endpoint, keys.p256dh, keys.auth, userAgent || null);

      console.log(`Push subscription saved for user ${req.user.username}: ${endpoint.substring(0, 50)}...`);
      res.json({ success: true, message: 'Subscription saved' });
    } catch (err) {
      console.error('Push subscription error:', err);
      res.status(500).json({ error: 'Failed to save subscription' });
    }
  });

  // Annotations sync endpoint (used by service worker background sync)
  router.post('/annotations', requireAuth, (req, res) => {
    const { image_id, case_id, annotations } = req.body;
    if (!image_id || !annotations) {
      return res.status(400).json({ error: 'image_id and annotations required' });
    }
    try {
      db.prepare('UPDATE images SET annotations = ? WHERE id = ?').run(
        typeof annotations === 'string' ? annotations : JSON.stringify(annotations),
        image_id
      );
      res.json({ success: true, message: 'Annotations saved' });
    } catch (err) {
      console.error('Annotation save error:', err);
      res.status(500).json({ error: 'Failed to save annotations' });
    }
  });

  // Progress sync endpoint (used by service worker background sync)
  router.post('/progress', requireAuth, (req, res) => {
    const userId = req.user?.id;
    const { case_id, event, data, sessionId } = req.body;

    if (!case_id && !sessionId) {
      return res.status(400).json({ error: 'case_id or sessionId required' });
    }

    // If it's a quiz attempt, record it
    if (event === 'answer_submitted' && case_id) {
      db.prepare(`
        INSERT INTO quiz_attempts (case_id, correct, time_spent_ms, user_id)
        VALUES (?, ?, ?, ?)
      `).run(case_id, data?.correct ? 1 : 0, data?.time_spent_ms || 0, userId);

      if (userId) {
        updateSpacedRepetition(db, userId, case_id, data?.correct ? 1 : 0);
      }
    }

    res.json({ success: true, message: 'Progress synced' });
  });

  // Active Micro-Learning Session (Cross-Device Resumption)
  router.get('/session/active', requireAuth, (req, res) => {
    const row = db.prepare('SELECT session_state, device_id, updated_at FROM active_sessions WHERE user_id = ?').get(req.user.id);
    if (!row) {
      return res.json({ session: null });
    }
    try {
      const state = JSON.parse(row.session_state);
      // Expire sessions older than 30 minutes
      const updatedAt = new Date(row.updated_at).getTime();
      if (Date.now() - updatedAt > 30 * 60 * 1000) {
        db.prepare('DELETE FROM active_sessions WHERE user_id = ?').run(req.user.id);
        return res.json({ session: null });
      }
      res.json({ session: state, deviceId: row.device_id, updatedAt: row.updated_at });
    } catch {
      res.json({ session: null });
    }
  });

  router.put('/session/active', requireAuth, (req, res) => {
    const { state, deviceId } = req.body;
    if (!state) {
      return res.status(400).json({ error: 'state is required' });
    }
    db.prepare(`
      INSERT INTO active_sessions (user_id, session_state, device_id, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET session_state = excluded.session_state, device_id = excluded.device_id, updated_at = datetime('now')
    `).run(req.user.id, JSON.stringify(state), deviceId || null);
    res.json({ success: true });
  });

  router.delete('/session/active', requireAuth, (req, res) => {
    db.prepare('DELETE FROM active_sessions WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  });

  // Bookmarks API
  router.get('/bookmarks', requireAuth, (req, res) => {
    const bookmarks = db.prepare(`
      SELECT b.*, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty,
             (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
      FROM bookmarks b
      JOIN cases c ON b.case_id = c.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(req.user.id);
    res.json({ bookmarks });
  });

  router.post('/bookmarks', requireAuth, (req, res) => {
    const { case_id } = req.body;
    if (!case_id) {
      return res.status(400).json({ error: 'case_id required' });
    }
    try {
      db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, case_id) VALUES (?, ?)').run(req.user.id, case_id);
      res.json({ success: true, message: 'Bookmarked' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to bookmark' });
    }
  });

  router.delete('/bookmarks/:caseId', requireAuth, (req, res) => {
    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND case_id = ?').run(req.user.id, req.params.caseId);
    res.json({ success: true, message: 'Bookmark removed' });
  });

  // Issue a short-lived token for WebSocket auth
  router.get('/sync/token', requireAuth, (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, username: req.user.username, displayName: req.user.displayName },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token });
  });

  // REST endpoint to get sync history
  router.get('/sync/events', requireAuth, (req, res) => {
    const { since, type, limit = 50 } = req.query;
    const params = [req.user.id];
    let sql = 'SELECT event_type, payload, device_id, created_at FROM sync_events WHERE user_id = ?';

    if (since) {
      sql += ' AND created_at > ?';
      params.push(since);
    }
    if (type) {
      sql += ' AND event_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const events = db.prepare(sql).all(...params);
    res.json({
      events: events.map(e => ({
        type: e.event_type,
        payload: JSON.parse(e.payload),
        deviceId: e.device_id,
        timestamp: e.created_at
      }))
    });
  });

  return router;
};
