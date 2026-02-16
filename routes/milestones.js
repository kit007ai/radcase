const express = require('express');
const { requireAuth } = require('../middleware/auth');
const MilestoneEngine = require('../lib/milestone-engine');

module.exports = function(db) {
  const router = express.Router();
  const engine = new MilestoneEngine(db);

  // GET /api/milestones - Get all milestones with user's progress
  router.get('/', requireAuth, (req, res) => {
    try {
      const summary = engine.getProgressSummary(req.user.id);
      res.json(summary);
    } catch (err) {
      console.error('Error getting milestone progress:', err);
      res.status(500).json({ error: 'Failed to get milestone progress' });
    }
  });

  // GET /api/milestones/gaps - Get gap analysis
  router.get('/gaps', requireAuth, (req, res) => {
    try {
      const gaps = engine.getGapAnalysis(req.user.id);
      res.json(gaps);
    } catch (err) {
      console.error('Error getting gap analysis:', err);
      res.status(500).json({ error: 'Failed to get gap analysis' });
    }
  });

  // POST /api/milestones/recalculate - Trigger recalculation of all milestones
  router.post('/recalculate', requireAuth, (req, res) => {
    try {
      const results = engine.recalculateAll(req.user.id);
      res.json({ success: true, milestones: results });
    } catch (err) {
      console.error('Error recalculating milestones:', err);
      res.status(500).json({ error: 'Failed to recalculate milestones' });
    }
  });

  // POST /api/milestones/assess - Faculty manual assessment
  router.post('/assess', requireAuth, (req, res) => {
    try {
      // Only faculty, program_director, attending, or admin can assess
      const allowedRoles = ['attending', 'admin'];
      if (!allowedRoles.includes(req.user.role)) {
        // Also check if they are faculty/PD in any program
        const programRole = db.prepare(`
          SELECT role FROM program_members WHERE user_id = ? AND role IN ('faculty', 'program_director') AND status = 'active' LIMIT 1
        `).get(req.user.id);

        if (!programRole) {
          return res.status(403).json({ error: 'Faculty or program director role required' });
        }
      }

      const { userId, milestoneId, level, notes } = req.body;

      if (!userId || !milestoneId || level === undefined || level === null) {
        return res.status(400).json({ error: 'userId, milestoneId, and level are required' });
      }

      if (typeof level !== 'number' || level < 1 || level > 5) {
        return res.status(400).json({ error: 'level must be a number between 1 and 5' });
      }

      // Verify milestone exists
      const milestone = db.prepare('SELECT id FROM acgme_milestones WHERE id = ?').get(milestoneId);
      if (!milestone) {
        return res.status(404).json({ error: 'Milestone not found' });
      }

      // Verify user exists
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      db.prepare(`
        INSERT INTO milestone_assessments (user_id, milestone_id, assessor_id, level, evidence_type, notes, created_at)
        VALUES (?, ?, ?, ?, 'faculty_assessment', ?, CURRENT_TIMESTAMP)
      `).run(userId, milestoneId, req.user.id, level, notes || null);

      // Recalculate the milestone after assessment
      const result = engine.calculateMilestoneLevel(userId, milestoneId);

      res.json({ success: true, assessment: { userId, milestoneId, level, assessorId: req.user.id }, updated: result });
    } catch (err) {
      console.error('Error recording assessment:', err);
      res.status(500).json({ error: 'Failed to record assessment' });
    }
  });

  // GET /api/milestones/cases/:caseId/milestones - Get milestones tagged to a case
  router.get('/cases/:caseId/milestones', (req, res) => {
    try {
      const caseMilestones = db.prepare(`
        SELECT cm.milestone_id, cm.relevance_score, am.domain, am.subdomain, am.description
        FROM case_milestones cm
        JOIN acgme_milestones am ON cm.milestone_id = am.id
        WHERE cm.case_id = ?
        ORDER BY cm.relevance_score DESC
      `).all(req.params.caseId);

      res.json({ caseId: req.params.caseId, milestones: caseMilestones });
    } catch (err) {
      console.error('Error getting case milestones:', err);
      res.status(500).json({ error: 'Failed to get case milestones' });
    }
  });

  // POST /api/milestones/cases/:caseId/auto-tag - Auto-tag case to milestones
  router.post('/cases/:caseId/auto-tag', requireAuth, (req, res) => {
    try {
      const caseData = db.prepare('SELECT id FROM cases WHERE id = ?').get(req.params.caseId);
      if (!caseData) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const tags = engine.autoTagCase(req.params.caseId);
      res.json({ success: true, caseId: req.params.caseId, tags });
    } catch (err) {
      console.error('Error auto-tagging case:', err);
      res.status(500).json({ error: 'Failed to auto-tag case' });
    }
  });

  // GET /api/milestones/:id - Get specific milestone detail with evidence
  router.get('/:id', requireAuth, (req, res) => {
    try {
      const milestone = db.prepare('SELECT * FROM acgme_milestones WHERE id = ?').get(req.params.id);
      if (!milestone) {
        return res.status(404).json({ error: 'Milestone not found' });
      }

      const progress = db.prepare(`
        SELECT * FROM milestone_progress WHERE user_id = ? AND milestone_id = ?
      `).get(req.user.id, req.params.id);

      const assessments = db.prepare(`
        SELECT ma.*, u.display_name as assessor_name
        FROM milestone_assessments ma
        LEFT JOIN users u ON ma.assessor_id = u.id
        WHERE ma.user_id = ? AND ma.milestone_id = ?
        ORDER BY ma.created_at DESC
      `).all(req.user.id, req.params.id);

      res.json({
        milestone: {
          ...milestone,
          level_descriptions: JSON.parse(milestone.level_descriptions || '{}'),
          body_parts: JSON.parse(milestone.body_parts || '[]'),
          modalities: JSON.parse(milestone.modalities || '[]')
        },
        progress: progress ? {
          currentLevel: progress.current_level,
          evidence: JSON.parse(progress.evidence || '[]'),
          assessmentCount: progress.assessment_count,
          lastAssessed: progress.last_assessed
        } : null,
        assessments
      });
    } catch (err) {
      console.error('Error getting milestone detail:', err);
      res.status(500).json({ error: 'Failed to get milestone detail' });
    }
  });

  return router;
};
