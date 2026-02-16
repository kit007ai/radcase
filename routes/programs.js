const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const MilestoneEngine = require('../lib/milestone-engine');

const router = express.Router();

module.exports = function(db) {
  const engine = new MilestoneEngine(db);

  // Helper: Check if user is program director or faculty for a program
  function isPDOrFaculty(userId, programId) {
    const member = db.prepare(`
      SELECT role FROM program_members
      WHERE user_id = ? AND program_id = ? AND status = 'active' AND role IN ('program_director', 'faculty')
    `).get(userId, programId);
    return member || null;
  }

  // Helper: Check if user is a member of a program
  function isMember(userId, programId) {
    return db.prepare(`
      SELECT role FROM program_members WHERE user_id = ? AND program_id = ? AND status = 'active'
    `).get(userId, programId);
  }

  // POST /api/programs/institutions - Create institution (admin only)
  router.post('/institutions', requireAuth, (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { name, type, logo_url } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Institution name is required' });
      }

      const id = uuidv4();
      const instType = ['academic', 'community', 'military', 'VA'].includes(type) ? type : 'academic';

      db.prepare(`
        INSERT INTO institutions (id, name, type, logo_url) VALUES (?, ?, ?, ?)
      `).run(id, name.trim(), instType, logo_url || null);

      res.json({ success: true, institution: { id, name: name.trim(), type: instType } });
    } catch (err) {
      console.error('Error creating institution:', err);
      res.status(500).json({ error: 'Failed to create institution' });
    }
  });

  // GET /api/programs/institutions - List institutions
  router.get('/institutions', requireAuth, (req, res) => {
    try {
      const institutions = db.prepare(`
        SELECT i.*, COUNT(p.id) as program_count
        FROM institutions i
        LEFT JOIN programs p ON i.id = p.institution_id
        GROUP BY i.id
        ORDER BY i.name
      `).all();

      res.json({ institutions });
    } catch (err) {
      console.error('Error listing institutions:', err);
      res.status(500).json({ error: 'Failed to list institutions' });
    }
  });

  // POST /api/programs - Create program
  router.post('/', requireAuth, (req, res) => {
    try {
      const { institution_id, name, specialty, accreditation_id } = req.body;

      if (!institution_id || !name || !name.trim()) {
        return res.status(400).json({ error: 'institution_id and name are required' });
      }

      // Verify institution exists
      const inst = db.prepare('SELECT id FROM institutions WHERE id = ?').get(institution_id);
      if (!inst) {
        return res.status(404).json({ error: 'Institution not found' });
      }

      const id = uuidv4();
      db.prepare(`
        INSERT INTO programs (id, institution_id, name, specialty, accreditation_id) VALUES (?, ?, ?, ?, ?)
      `).run(id, institution_id, name.trim(), specialty || 'diagnostic_radiology', accreditation_id || null);

      // Add creator as program_director
      db.prepare(`
        INSERT INTO program_members (program_id, user_id, role, status) VALUES (?, ?, 'program_director', 'active')
      `).run(id, req.user.id);

      res.json({ success: true, program: { id, institution_id, name: name.trim(), specialty: specialty || 'diagnostic_radiology' } });
    } catch (err) {
      console.error('Error creating program:', err);
      res.status(500).json({ error: 'Failed to create program' });
    }
  });

  // GET /api/programs - List user's programs
  router.get('/', requireAuth, (req, res) => {
    try {
      const programs = db.prepare(`
        SELECT p.*, pm.role as member_role, i.name as institution_name
        FROM programs p
        JOIN program_members pm ON p.id = pm.program_id
        JOIN institutions i ON p.institution_id = i.id
        WHERE pm.user_id = ? AND pm.status = 'active'
        ORDER BY p.name
      `).all(req.user.id);

      res.json({ programs });
    } catch (err) {
      console.error('Error listing programs:', err);
      res.status(500).json({ error: 'Failed to list programs' });
    }
  });

  // GET /api/programs/:id - Get program detail
  router.get('/:id', requireAuth, (req, res) => {
    try {
      const member = isMember(req.user.id, req.params.id);
      if (!member && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied: not a program member' });
      }

      const program = db.prepare(`
        SELECT p.*, i.name as institution_name, i.type as institution_type
        FROM programs p
        JOIN institutions i ON p.institution_id = i.id
        WHERE p.id = ?
      `).get(req.params.id);

      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      const members = db.prepare(`
        SELECT pm.*, u.display_name, u.username, u.email
        FROM program_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.program_id = ?
        ORDER BY pm.role, pm.pgy_year
      `).all(req.params.id);

      res.json({ program, members });
    } catch (err) {
      console.error('Error getting program detail:', err);
      res.status(500).json({ error: 'Failed to get program detail' });
    }
  });

  // PUT /api/programs/:id - Update program settings (PD only)
  router.put('/:id', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if ((!pdRole || pdRole.role !== 'program_director') && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Program director access required' });
      }

      const { name, specialty, accreditation_id, settings } = req.body;

      const updates = [];
      const params = [];

      if (name) { updates.push('name = ?'); params.push(name.trim()); }
      if (specialty) { updates.push('specialty = ?'); params.push(specialty); }
      if (accreditation_id !== undefined) { updates.push('accreditation_id = ?'); params.push(accreditation_id); }
      if (settings) { updates.push('settings = ?'); params.push(JSON.stringify(settings)); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(req.params.id);
      db.prepare(`UPDATE programs SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      res.json({ success: true });
    } catch (err) {
      console.error('Error updating program:', err);
      res.status(500).json({ error: 'Failed to update program' });
    }
  });

  // POST /api/programs/:id/members - Add member to program (PD only)
  router.post('/:id/members', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if ((!pdRole || pdRole.role !== 'program_director') && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Program director access required' });
      }

      const { user_id, role, pgy_year, start_date } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      const validRoles = ['resident', 'program_director', 'faculty', 'coordinator'];
      const memberRole = validRoles.includes(role) ? role : 'resident';

      // Verify user exists
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if already a member
      const existing = db.prepare('SELECT id FROM program_members WHERE program_id = ? AND user_id = ?').get(req.params.id, user_id);
      if (existing) {
        return res.status(409).json({ error: 'User is already a member of this program' });
      }

      db.prepare(`
        INSERT INTO program_members (program_id, user_id, role, pgy_year, start_date, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(req.params.id, user_id, memberRole, pgy_year || null, start_date || null);

      res.json({ success: true, member: { programId: req.params.id, userId: user_id, role: memberRole, pgyYear: pgy_year } });
    } catch (err) {
      console.error('Error adding member:', err);
      res.status(500).json({ error: 'Failed to add member' });
    }
  });

  // PUT /api/programs/:id/members/:userId - Update member role/PGY (PD only)
  router.put('/:id/members/:userId', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if ((!pdRole || pdRole.role !== 'program_director') && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Program director access required' });
      }

      const { role, pgy_year, status } = req.body;

      const member = db.prepare('SELECT id FROM program_members WHERE program_id = ? AND user_id = ?').get(req.params.id, req.params.userId);
      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      const updates = [];
      const params = [];

      if (role) {
        const validRoles = ['resident', 'program_director', 'faculty', 'coordinator'];
        if (validRoles.includes(role)) {
          updates.push('role = ?');
          params.push(role);
        }
      }
      if (pgy_year !== undefined) { updates.push('pgy_year = ?'); params.push(pgy_year); }
      if (status) {
        const validStatuses = ['active', 'graduated', 'transferred', 'inactive'];
        if (validStatuses.includes(status)) {
          updates.push('status = ?');
          params.push(status);
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(req.params.id, req.params.userId);
      db.prepare(`UPDATE program_members SET ${updates.join(', ')} WHERE program_id = ? AND user_id = ?`).run(...params);

      res.json({ success: true });
    } catch (err) {
      console.error('Error updating member:', err);
      res.status(500).json({ error: 'Failed to update member' });
    }
  });

  // DELETE /api/programs/:id/members/:userId - Remove member (PD only)
  router.delete('/:id/members/:userId', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if ((!pdRole || pdRole.role !== 'program_director') && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Program director access required' });
      }

      const result = db.prepare('DELETE FROM program_members WHERE program_id = ? AND user_id = ?').run(req.params.id, req.params.userId);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Member not found' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Error removing member:', err);
      res.status(500).json({ error: 'Failed to remove member' });
    }
  });

  // GET /api/programs/:id/dashboard - Program director dashboard data
  router.get('/:id/dashboard', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if (!pdRole && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Faculty or program director access required' });
      }

      const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      // Resident count by PGY year
      const residentsByYear = db.prepare(`
        SELECT pgy_year, COUNT(*) as count
        FROM program_members
        WHERE program_id = ? AND status = 'active' AND role = 'resident'
        GROUP BY pgy_year
        ORDER BY pgy_year
      `).all(req.params.id);

      // Overall milestone progress averages
      const milestoneAvgs = db.prepare(`
        SELECT am.domain, AVG(mp.current_level) as avg_level
        FROM program_members pm
        JOIN milestone_progress mp ON pm.user_id = mp.user_id
        JOIN acgme_milestones am ON mp.milestone_id = am.id
        WHERE pm.program_id = ? AND pm.status = 'active' AND pm.role = 'resident'
        GROUP BY am.domain
      `).all(req.params.id);

      // Recent activity
      const totalQuizAttempts = db.prepare(`
        SELECT COUNT(*) as count
        FROM quiz_attempts qa
        JOIN program_members pm ON qa.user_id = pm.user_id
        WHERE pm.program_id = ? AND pm.status = 'active'
        AND qa.attempted_at >= datetime('now', '-30 days')
      `).get(req.params.id);

      // At-risk residents
      const atRisk = engine.identifyAtRisk(req.params.id);

      res.json({
        program,
        residentsByYear,
        milestoneAvgs,
        recentActivity: {
          quizAttempts30d: totalQuizAttempts ? totalQuizAttempts.count : 0
        },
        atRiskResidents: atRisk.length,
        atRisk: atRisk.slice(0, 5)
      });
    } catch (err) {
      console.error('Error getting dashboard:', err);
      res.status(500).json({ error: 'Failed to get dashboard data' });
    }
  });

  // GET /api/programs/:id/residents/:userId - Individual resident deep-dive
  router.get('/:id/residents/:userId', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if (!pdRole && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Faculty or program director access required' });
      }

      const member = db.prepare(`
        SELECT pm.*, u.display_name, u.username, u.email
        FROM program_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.program_id = ? AND pm.user_id = ?
      `).get(req.params.id, req.params.userId);

      if (!member) {
        return res.status(404).json({ error: 'Resident not found in this program' });
      }

      // Get milestone progress
      const milestoneProgress = engine.getProgressSummary(req.params.userId);

      // Get gap analysis
      const gaps = engine.getGapAnalysis(req.params.userId);

      // Recent quiz performance
      const recentQuiz = db.prepare(`
        SELECT COUNT(*) as total, SUM(correct) as correct_count
        FROM quiz_attempts
        WHERE user_id = ? AND attempted_at >= datetime('now', '-30 days')
      `).get(req.params.userId);

      // Assessments history
      const assessments = db.prepare(`
        SELECT ma.*, am.subdomain, u.display_name as assessor_name
        FROM milestone_assessments ma
        JOIN acgme_milestones am ON ma.milestone_id = am.id
        LEFT JOIN users u ON ma.assessor_id = u.id
        WHERE ma.user_id = ?
        ORDER BY ma.created_at DESC
        LIMIT 20
      `).all(req.params.userId);

      res.json({
        resident: member,
        milestoneProgress,
        gaps,
        recentPerformance: {
          quizTotal: recentQuiz ? recentQuiz.total : 0,
          quizCorrect: recentQuiz ? recentQuiz.correct_count : 0,
          quizAccuracy: recentQuiz && recentQuiz.total > 0
            ? Math.round((recentQuiz.correct_count / recentQuiz.total) * 100)
            : 0
        },
        assessments
      });
    } catch (err) {
      console.error('Error getting resident detail:', err);
      res.status(500).json({ error: 'Failed to get resident detail' });
    }
  });

  // GET /api/programs/:id/cohort-stats - Cohort statistics & benchmarks
  router.get('/:id/cohort-stats', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if (!pdRole && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Faculty or program director access required' });
      }

      const { pgy_year } = req.query;

      let query = `
        SELECT * FROM cohort_snapshots
        WHERE program_id = ?
      `;
      const params = [req.params.id];

      if (pgy_year) {
        query += ' AND pgy_year = ?';
        params.push(parseInt(pgy_year));
      }

      query += ' ORDER BY snapshot_date DESC, pgy_year LIMIT 100';

      const snapshots = db.prepare(query).all(...params);

      res.json({
        snapshots: snapshots.map(s => ({
          ...s,
          percentiles: JSON.parse(s.percentiles || '{}')
        }))
      });
    } catch (err) {
      console.error('Error getting cohort stats:', err);
      res.status(500).json({ error: 'Failed to get cohort statistics' });
    }
  });

  // POST /api/programs/:id/cohort-snapshot - Generate cohort snapshot
  router.post('/:id/cohort-snapshot', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if ((!pdRole || pdRole.role !== 'program_director') && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Program director access required' });
      }

      const results = engine.generateCohortSnapshot(req.params.id);
      if (results === null) {
        return res.status(404).json({ error: 'Program not found' });
      }

      res.json({ success: true, snapshots: results });
    } catch (err) {
      console.error('Error generating cohort snapshot:', err);
      res.status(500).json({ error: 'Failed to generate cohort snapshot' });
    }
  });

  // GET /api/programs/:id/milestone-report - Exportable ACGME milestone report
  router.get('/:id/milestone-report', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if ((!pdRole || pdRole.role !== 'program_director') && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Program director access required' });
      }

      const program = db.prepare(`
        SELECT p.*, i.name as institution_name
        FROM programs p
        JOIN institutions i ON p.institution_id = i.id
        WHERE p.id = ?
      `).get(req.params.id);

      if (!program) {
        return res.status(404).json({ error: 'Program not found' });
      }

      // Get all active residents
      const residents = db.prepare(`
        SELECT pm.user_id, pm.pgy_year, u.display_name, u.username
        FROM program_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.program_id = ? AND pm.status = 'active' AND pm.role = 'resident'
        ORDER BY pm.pgy_year, u.display_name
      `).all(req.params.id);

      // Get all milestones
      const milestones = db.prepare('SELECT * FROM acgme_milestones ORDER BY display_order').all();

      // Build report data per resident
      const report = residents.map(r => {
        const progress = db.prepare(`
          SELECT milestone_id, current_level, assessment_count, last_assessed
          FROM milestone_progress
          WHERE user_id = ?
        `).all(r.user_id);

        const progressMap = {};
        for (const p of progress) {
          progressMap[p.milestone_id] = p;
        }

        return {
          userId: r.user_id,
          displayName: r.display_name || r.username,
          pgyYear: r.pgy_year,
          milestones: milestones.map(m => ({
            id: m.id,
            domain: m.domain,
            subdomain: m.subdomain,
            currentLevel: progressMap[m.id] ? progressMap[m.id].current_level : null,
            assessmentCount: progressMap[m.id] ? progressMap[m.id].assessment_count : 0,
            lastAssessed: progressMap[m.id] ? progressMap[m.id].last_assessed : null
          }))
        };
      });

      res.json({
        program: {
          id: program.id,
          name: program.name,
          institution: program.institution_name,
          accreditationId: program.accreditation_id
        },
        generatedAt: new Date().toISOString(),
        residents: report,
        milestoneDefinitions: milestones.map(m => ({
          id: m.id,
          domain: m.domain,
          subdomain: m.subdomain,
          description: m.description
        }))
      });
    } catch (err) {
      console.error('Error generating milestone report:', err);
      res.status(500).json({ error: 'Failed to generate milestone report' });
    }
  });

  // GET /api/programs/:id/at-risk - Identify at-risk residents
  router.get('/:id/at-risk', requireAuth, (req, res) => {
    try {
      const pdRole = isPDOrFaculty(req.user.id, req.params.id);
      if (!pdRole && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Faculty or program director access required' });
      }

      const atRisk = engine.identifyAtRisk(req.params.id);
      res.json({ atRisk, count: atRisk.length });
    } catch (err) {
      console.error('Error identifying at-risk residents:', err);
      res.status(500).json({ error: 'Failed to identify at-risk residents' });
    }
  });

  return router;
};
