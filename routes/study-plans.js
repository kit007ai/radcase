const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = function(db) {

  // GET /api/study-plans/templates - Available plan templates
  router.get('/templates', (req, res) => {
    const templates = db.prepare('SELECT * FROM study_plan_templates ORDER BY name').all();
    res.json({
      templates: templates.map(t => ({
        ...t,
        milestones: JSON.parse(t.milestones),
      })),
    });
  });

  // POST /api/study-plans - Create plan from template or custom
  router.post('/', requireAuth, (req, res) => {
    const { templateId, name, targetDate } = req.body;
    const userId = req.user.id;
    const planId = uuidv4();

    let milestones;
    let planName = name;

    if (templateId) {
      const template = db.prepare('SELECT * FROM study_plan_templates WHERE id = ?').get(templateId);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      milestones = JSON.parse(template.milestones);
      planName = planName || template.name;

      // Resolve case IDs for each milestone
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        const cases = selectCasesForMilestone(db, m.criteria, m.caseCount);
        m.caseIds = cases.map(c => c.id);
      }
    } else {
      // Custom plan
      milestones = req.body.milestones || [];
    }

    db.prepare(`
      INSERT INTO user_study_plans (id, user_id, template_id, name, target_date, milestones)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(planId, userId, templateId || null, planName, targetDate || null, JSON.stringify(milestones));

    res.json({
      id: planId,
      name: planName,
      milestones,
    });
  });

  // GET /api/study-plans - List user's plans
  router.get('/', requireAuth, (req, res) => {
    const plans = db.prepare(`
      SELECT * FROM user_study_plans WHERE user_id = ? ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
        updated_at DESC
    `).all(req.user.id);

    const result = plans.map(p => {
      const milestones = JSON.parse(p.milestones);
      const progressRows = db.prepare('SELECT * FROM study_plan_progress WHERE plan_id = ?').all(p.id);
      const attemptedCount = progressRows.filter(r => r.attempted).length;
      const totalCases = milestones.reduce((sum, m) => sum + (m.caseIds?.length || m.caseCount || 0), 0);

      return {
        id: p.id,
        name: p.name,
        templateId: p.template_id,
        targetDate: p.target_date,
        status: p.status,
        currentMilestone: p.current_milestone,
        totalMilestones: milestones.length,
        progress: totalCases > 0 ? Math.round((attemptedCount / totalCases) * 100) : 0,
        createdAt: p.created_at,
      };
    });

    res.json({ plans: result });
  });

  // GET /api/study-plans/:id - Plan detail with progress
  router.get('/:id', requireAuth, (req, res) => {
    const plan = db.prepare('SELECT * FROM user_study_plans WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const milestones = JSON.parse(plan.milestones);
    const progressRows = db.prepare('SELECT * FROM study_plan_progress WHERE plan_id = ?').all(plan.id);
    const progressMap = {};
    for (const row of progressRows) {
      progressMap[row.case_id] = row;
    }

    // Annotate milestones with progress
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      const caseIds = m.caseIds || [];
      const attempted = caseIds.filter(id => progressMap[id]?.attempted).length;
      const correct = caseIds.filter(id => progressMap[id]?.correct).length;
      m.progress = {
        attempted,
        correct,
        total: caseIds.length,
        accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
        complete: attempted >= caseIds.length,
      };
      m.locked = i > plan.current_milestone;
    }

    res.json({
      id: plan.id,
      name: plan.name,
      templateId: plan.template_id,
      targetDate: plan.target_date,
      status: plan.status,
      currentMilestone: plan.current_milestone,
      milestones,
    });
  });

  // GET /api/study-plans/:id/next-session - Next batch of cases for current milestone
  router.get('/:id/next-session', requireAuth, (req, res) => {
    const plan = db.prepare('SELECT * FROM user_study_plans WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const milestones = JSON.parse(plan.milestones);
    const milestone = milestones[plan.current_milestone];
    if (!milestone) return res.json({ cases: [], complete: true });

    const caseIds = milestone.caseIds || [];
    const progressRows = db.prepare('SELECT case_id FROM study_plan_progress WHERE plan_id = ? AND attempted = 1')
      .all(plan.id);
    const attemptedIds = new Set(progressRows.map(r => r.case_id));

    // Get unattempted cases for this milestone
    const remaining = caseIds.filter(id => !attemptedIds.has(id));
    const batch = remaining.slice(0, 10); // 10 at a time

    if (batch.length === 0) {
      return res.json({ cases: [], complete: true, milestoneComplete: true });
    }

    const cases = batch.map(id => {
      const c = db.prepare(`
        SELECT c.*, (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
        FROM cases c WHERE c.id = ?
      `).get(id);
      return c;
    }).filter(Boolean);

    res.json({
      cases,
      planId: plan.id,
      milestoneIndex: plan.current_milestone,
      milestoneName: milestone.name,
      remaining: remaining.length,
    });
  });

  // POST /api/study-plans/:id/progress - Record progress
  router.post('/:id/progress', requireAuth, (req, res) => {
    const { caseId, correct, milestoneIndex } = req.body;
    const plan = db.prepare('SELECT * FROM user_study_plans WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    db.prepare(`
      INSERT OR REPLACE INTO study_plan_progress (plan_id, case_id, milestone_index, attempted, correct, attempted_at)
      VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).run(plan.id, caseId, milestoneIndex ?? plan.current_milestone, correct ? 1 : 0);

    // Check if current milestone is complete
    const milestones = JSON.parse(plan.milestones);
    const currentMs = milestones[plan.current_milestone];
    if (currentMs) {
      const caseIds = currentMs.caseIds || [];
      const attemptedCount = db.prepare(`
        SELECT COUNT(*) as c FROM study_plan_progress
        WHERE plan_id = ? AND milestone_index = ? AND attempted = 1
      `).get(plan.id, plan.current_milestone);

      if (attemptedCount.c >= caseIds.length && plan.current_milestone < milestones.length - 1) {
        // Advance to next milestone
        db.prepare('UPDATE user_study_plans SET current_milestone = current_milestone + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(plan.id);
      } else if (attemptedCount.c >= caseIds.length && plan.current_milestone >= milestones.length - 1) {
        // Plan complete
        db.prepare("UPDATE user_study_plans SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(plan.id);
      }
    }

    res.json({ message: 'Progress recorded' });
  });

  return router;
};

function selectCasesForMilestone(db, criteria, count) {
  let sql = `SELECT id FROM cases WHERE diagnosis IS NOT NULL AND diagnosis != ''`;
  const params = [];

  if (criteria.body_part) {
    if (Array.isArray(criteria.body_part)) {
      sql += ` AND body_part IN (${criteria.body_part.map(() => '?').join(',')})`;
      params.push(...criteria.body_part);
    } else {
      sql += ' AND body_part = ?';
      params.push(criteria.body_part);
    }
  }
  if (criteria.modality) {
    sql += ' AND modality = ?';
    params.push(criteria.modality);
  }
  if (criteria.difficulty && Array.isArray(criteria.difficulty)) {
    sql += ` AND difficulty IN (${criteria.difficulty.map(() => '?').join(',')})`;
    params.push(...criteria.difficulty);
  }

  sql += ' ORDER BY RANDOM() LIMIT ?';
  params.push(count);

  return db.prepare(sql).all(...params);
}
