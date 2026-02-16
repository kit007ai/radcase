const express = require('express');
const { requireAuth } = require('../middleware/auth');
const MilestoneEngine = require('../lib/milestone-engine');

module.exports = function(db) {
  const router = express.Router();
  const engine = new MilestoneEngine(db);

  // GET /api/cme - Get user's CME credits
  router.get('/', requireAuth, (req, res) => {
    try {
      const { category, limit = 50, offset = 0 } = req.query;

      let query = 'SELECT * FROM cme_credits WHERE user_id = ?';
      const params = [req.user.id];

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }

      query += ' ORDER BY completed_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const credits = db.prepare(query).all(...params);

      const totalRow = db.prepare('SELECT SUM(credits) as total FROM cme_credits WHERE user_id = ?').get(req.user.id);

      res.json({
        credits,
        total: totalRow ? totalRow.total || 0 : 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (err) {
      console.error('Error getting CME credits:', err);
      res.status(500).json({ error: 'Failed to get CME credits' });
    }
  });

  // GET /api/cme/summary - Get CME summary by category
  router.get('/summary', requireAuth, (req, res) => {
    try {
      const summary = db.prepare(`
        SELECT category, SUM(credits) as total_credits, COUNT(*) as activity_count
        FROM cme_credits
        WHERE user_id = ?
        GROUP BY category
      `).all(req.user.id);

      const totalRow = db.prepare('SELECT SUM(credits) as total FROM cme_credits WHERE user_id = ?').get(req.user.id);

      // Credits by year
      const byYear = db.prepare(`
        SELECT strftime('%Y', completed_at) as year, SUM(credits) as total_credits
        FROM cme_credits
        WHERE user_id = ?
        GROUP BY strftime('%Y', completed_at)
        ORDER BY year DESC
      `).all(req.user.id);

      res.json({
        totalCredits: totalRow ? totalRow.total || 0 : 0,
        byCategory: summary,
        byYear
      });
    } catch (err) {
      console.error('Error getting CME summary:', err);
      res.status(500).json({ error: 'Failed to get CME summary' });
    }
  });

  // POST /api/cme/record - Manually record CME credit
  router.post('/record', requireAuth, (req, res) => {
    try {
      const { activity_type, activity_id, credits, category, title } = req.body;

      if (!activity_type || !activity_type.trim()) {
        return res.status(400).json({ error: 'activity_type is required' });
      }

      if (credits === undefined || credits === null || typeof credits !== 'number' || credits <= 0) {
        return res.status(400).json({ error: 'credits must be a positive number' });
      }

      const validCategories = ['SA-CME', 'CME', 'MOC'];
      const cmeCategory = validCategories.includes(category) ? category : 'SA-CME';

      db.prepare(`
        INSERT INTO cme_credits (user_id, activity_type, activity_id, credits, category, title)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.user.id, activity_type.trim(), activity_id || null, credits, cmeCategory, title || null);

      res.json({ success: true, credit: { userId: req.user.id, activityType: activity_type.trim(), credits, category: cmeCategory, title } });
    } catch (err) {
      console.error('Error recording CME credit:', err);
      res.status(500).json({ error: 'Failed to record CME credit' });
    }
  });

  return router;
};
