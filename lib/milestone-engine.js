const { v4: uuidv4 } = require('uuid');

class MilestoneEngine {
  constructor(db) {
    this.db = db;
  }

  /**
   * Calculate milestone level for a user based on all evidence.
   * Uses activity count + accuracy with exponential time decay (half-life 60 days).
   */
  calculateMilestoneLevel(userId, milestoneId) {
    const milestone = this.db.prepare('SELECT * FROM acgme_milestones WHERE id = ?').get(milestoneId);
    if (!milestone) return null;

    const bodyParts = JSON.parse(milestone.body_parts || '[]');
    const modalities = JSON.parse(milestone.modalities || '[]');

    // Gather evidence from multiple sources
    const evidence = [];

    // 1. Quiz attempts - match by body_part/modality of the case
    const quizAttempts = this.db.prepare(`
      SELECT qa.id, qa.correct, qa.time_spent_ms, qa.attempted_at, c.body_part, c.modality, c.difficulty
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ?
      ORDER BY qa.attempted_at DESC
    `).all(userId);

    for (const qa of quizAttempts) {
      if (this._matchesMilestone(qa.body_part, qa.modality, bodyParts, modalities)) {
        evidence.push({
          type: 'quiz',
          id: qa.id,
          score: qa.correct ? (0.5 + (qa.difficulty || 2) * 0.1) : 0,
          date: qa.attempted_at,
          weight: 0.3
        });
      }
    }

    // 2. Differential attempts
    const diffAttempts = this.db.prepare(`
      SELECT da.id, da.score, da.created_at, c.body_part, c.modality
      FROM differential_attempts da
      JOIN cases c ON da.case_id = c.id
      WHERE da.user_id = ?
      ORDER BY da.created_at DESC
    `).all(userId);

    for (const da of diffAttempts) {
      if (this._matchesMilestone(da.body_part, da.modality, bodyParts, modalities)) {
        evidence.push({
          type: 'differential',
          id: da.id,
          score: da.score / 100,
          date: da.created_at,
          weight: 0.25
        });
      }
    }

    // 3. Oral board sessions
    const obSessions = this.db.prepare(`
      SELECT obs.id, obs.score, obs.completed_at, c.body_part, c.modality
      FROM oral_board_sessions obs
      JOIN cases c ON obs.case_id = c.id
      WHERE obs.user_id = ? AND obs.status = 'completed' AND obs.score IS NOT NULL
      ORDER BY obs.completed_at DESC
    `).all(userId);

    for (const obs of obSessions) {
      if (this._matchesMilestone(obs.body_part, obs.modality, bodyParts, modalities)) {
        evidence.push({
          type: 'oral_board',
          id: obs.id,
          score: (obs.score || 0) / 100,
          date: obs.completed_at,
          weight: 0.25
        });
      }
    }

    // 4. Report attempts
    const reportAttempts = this.db.prepare(`
      SELECT ra.id, ra.score, ra.created_at, c.body_part, c.modality
      FROM report_attempts ra
      JOIN cases c ON ra.case_id = c.id
      WHERE ra.user_id = ?
      ORDER BY ra.created_at DESC
    `).all(userId);

    for (const ra of reportAttempts) {
      if (this._matchesMilestone(ra.body_part, ra.modality, bodyParts, modalities)) {
        evidence.push({
          type: 'case_review',
          id: ra.id,
          score: (ra.score || 0) / 100,
          date: ra.created_at,
          weight: 0.1
        });
      }
    }

    // 5. Faculty assessments
    const assessments = this.db.prepare(`
      SELECT id, level, created_at
      FROM milestone_assessments
      WHERE user_id = ? AND milestone_id = ?
      ORDER BY created_at DESC
    `).all(userId, milestoneId);

    for (const a of assessments) {
      evidence.push({
        type: 'faculty_assessment',
        id: a.id,
        score: a.level / 5.0,
        date: a.created_at,
        weight: 0.1
      });
    }

    // If no faculty assessments, redistribute their weight
    const hasFacultyAssessments = assessments.length > 0;
    if (!hasFacultyAssessments) {
      for (const e of evidence) {
        if (e.type === 'quiz') e.weight = 0.35;
        else if (e.type === 'differential') e.weight = 0.275;
        else if (e.type === 'oral_board') e.weight = 0.275;
        else if (e.type === 'case_review') e.weight = 0.1;
      }
    }

    // Calculate weighted score with exponential time decay (half-life 60 days)
    const now = Date.now();
    const HALF_LIFE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days in ms

    let weightedSum = 0;
    let totalWeight = 0;

    for (const e of evidence) {
      const ageMs = now - new Date(e.date).getTime();
      const decay = Math.pow(0.5, ageMs / HALF_LIFE_MS);
      const w = e.weight * decay;
      weightedSum += e.score * w;
      totalWeight += w;
    }

    const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const activityCount = evidence.length;

    // Map activity count + accuracy to level 1-5
    const level = this._calculateLevel(activityCount, avgScore);

    // Update milestone_progress
    const evidenceSummary = evidence.slice(0, 50).map(e => ({
      type: e.type,
      id: e.id,
      score: Math.round(e.score * 100) / 100,
      date: e.date
    }));

    this.db.prepare(`
      INSERT INTO milestone_progress (user_id, milestone_id, current_level, evidence, assessment_count, last_assessed, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, milestone_id) DO UPDATE SET
        current_level = excluded.current_level,
        evidence = excluded.evidence,
        assessment_count = excluded.assessment_count,
        last_assessed = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, milestoneId, Math.round(level * 10) / 10, JSON.stringify(evidenceSummary), activityCount);

    return {
      milestoneId,
      level: Math.round(level * 10) / 10,
      activityCount,
      avgScore: Math.round(avgScore * 100) / 100,
      evidenceCount: evidence.length
    };
  }

  /**
   * Map activity count and accuracy to level 1.0-5.0
   */
  _calculateLevel(activityCount, avgScore) {
    // Level 1: < 10 activities, < 50% accuracy
    // Level 2: 10-30 activities, 50-65% accuracy
    // Level 3: 30-60 activities, 65-80% accuracy (graduation target)
    // Level 4: 60-100 activities, 80-90% accuracy
    // Level 5: 100+ activities, 90%+ accuracy

    let countLevel, scoreLevel;

    if (activityCount < 10) countLevel = 1;
    else if (activityCount < 30) countLevel = 2;
    else if (activityCount < 60) countLevel = 3;
    else if (activityCount < 100) countLevel = 4;
    else countLevel = 5;

    if (avgScore < 0.5) scoreLevel = 1;
    else if (avgScore < 0.65) scoreLevel = 2;
    else if (avgScore < 0.8) scoreLevel = 3;
    else if (avgScore < 0.9) scoreLevel = 4;
    else scoreLevel = 5;

    // Weighted average: activity count 40%, accuracy 60%
    return Math.max(1, countLevel * 0.4 + scoreLevel * 0.6);
  }

  /**
   * Check if a case's body_part/modality matches a milestone's relevant areas
   */
  _matchesMilestone(bodyPart, modality, milestoneBodyParts, milestoneModalities) {
    const bpMatch = !bodyPart || milestoneBodyParts.length === 0 ||
      milestoneBodyParts.some(bp => bodyPart.toLowerCase().includes(bp.toLowerCase()));
    const modMatch = !modality || milestoneModalities.length === 0 ||
      milestoneModalities.some(m => modality.toLowerCase().includes(m.toLowerCase()));
    return bpMatch && modMatch;
  }

  /**
   * Recalculate all milestones for a user
   */
  recalculateAll(userId) {
    const milestones = this.db.prepare('SELECT id FROM acgme_milestones').all();
    const results = [];
    for (const m of milestones) {
      const result = this.calculateMilestoneLevel(userId, m.id);
      if (result) results.push(result);
    }
    return results;
  }

  /**
   * Get milestone progress summary for a user
   */
  getProgressSummary(userId) {
    const milestones = this.db.prepare(`
      SELECT am.*, mp.current_level, mp.assessment_count, mp.last_assessed
      FROM acgme_milestones am
      LEFT JOIN milestone_progress mp ON am.id = mp.milestone_id AND mp.user_id = ?
      ORDER BY am.display_order
    `).all(userId);

    const domains = {};
    for (const m of milestones) {
      if (!domains[m.domain]) {
        domains[m.domain] = { domain: m.domain, milestones: [], avgLevel: 0 };
      }
      domains[m.domain].milestones.push({
        id: m.id,
        subdomain: m.subdomain,
        description: m.description,
        currentLevel: m.current_level || 1.0,
        assessmentCount: m.assessment_count || 0,
        lastAssessed: m.last_assessed
      });
    }

    // Calculate domain averages
    for (const d of Object.values(domains)) {
      const sum = d.milestones.reduce((acc, m) => acc + m.currentLevel, 0);
      d.avgLevel = Math.round((sum / d.milestones.length) * 10) / 10;
    }

    const allLevels = milestones.map(m => m.current_level || 1.0);
    const overallAvg = allLevels.length > 0
      ? Math.round((allLevels.reduce((a, b) => a + b, 0) / allLevels.length) * 10) / 10
      : 1.0;

    return {
      overallLevel: overallAvg,
      domains: Object.values(domains),
      totalMilestones: milestones.length,
      assessedCount: milestones.filter(m => m.current_level !== null).length
    };
  }

  /**
   * Get gap analysis: which milestones need more cases/activity
   */
  getGapAnalysis(userId) {
    // Get user's PGY year to determine expected level
    const member = this.db.prepare(`
      SELECT pgy_year FROM program_members WHERE user_id = ? AND status = 'active' LIMIT 1
    `).get(userId);
    const pgyYear = member ? member.pgy_year : null;

    // Expected levels by PGY year:
    // PGY-1: 1.5, PGY-2: 2.0, PGY-3: 2.5, PGY-4: 3.0, PGY-5: 3.5
    const expectedLevel = pgyYear ? Math.min(1.0 + pgyYear * 0.5, 4.0) : 3.0;

    const milestones = this.db.prepare(`
      SELECT am.*, mp.current_level, mp.assessment_count
      FROM acgme_milestones am
      LEFT JOIN milestone_progress mp ON am.id = mp.milestone_id AND mp.user_id = ?
      ORDER BY COALESCE(mp.current_level, 1.0) ASC
    `).all(userId);

    const gaps = [];
    for (const m of milestones) {
      const currentLevel = m.current_level || 1.0;
      const gap = expectedLevel - currentLevel;
      if (gap > 0) {
        gaps.push({
          milestoneId: m.id,
          domain: m.domain,
          subdomain: m.subdomain,
          currentLevel,
          expectedLevel,
          gap: Math.round(gap * 10) / 10,
          assessmentCount: m.assessment_count || 0,
          priority: gap > 1.5 ? 'high' : gap > 0.5 ? 'medium' : 'low'
        });
      }
    }

    // Sort by gap size descending
    gaps.sort((a, b) => b.gap - a.gap);

    return {
      expectedLevel,
      pgyYear,
      gaps,
      totalGaps: gaps.length,
      highPriority: gaps.filter(g => g.priority === 'high').length,
      mediumPriority: gaps.filter(g => g.priority === 'medium').length
    };
  }

  /**
   * Identify at-risk residents (below expected level for PGY year)
   */
  identifyAtRisk(programId) {
    const members = this.db.prepare(`
      SELECT pm.user_id, pm.pgy_year, pm.role, u.display_name, u.username
      FROM program_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.program_id = ? AND pm.status = 'active' AND pm.role = 'resident'
    `).all(programId);

    const atRisk = [];

    for (const m of members) {
      const expectedLevel = Math.min(1.0 + (m.pgy_year || 1) * 0.5, 4.0);

      const progress = this.db.prepare(`
        SELECT AVG(current_level) as avg_level, COUNT(*) as assessed_count
        FROM milestone_progress
        WHERE user_id = ?
      `).get(m.user_id);

      const avgLevel = progress && progress.avg_level ? progress.avg_level : 1.0;
      const gap = expectedLevel - avgLevel;

      if (gap > 0.5) {
        // Get specific weak milestones
        const weakMilestones = this.db.prepare(`
          SELECT am.id, am.subdomain, mp.current_level
          FROM acgme_milestones am
          LEFT JOIN milestone_progress mp ON am.id = mp.milestone_id AND mp.user_id = ?
          WHERE COALESCE(mp.current_level, 1.0) < ?
          ORDER BY COALESCE(mp.current_level, 1.0) ASC
          LIMIT 5
        `).all(m.user_id, expectedLevel - 0.5);

        atRisk.push({
          userId: m.user_id,
          displayName: m.display_name || m.username,
          pgyYear: m.pgy_year,
          avgLevel: Math.round(avgLevel * 10) / 10,
          expectedLevel,
          gap: Math.round(gap * 10) / 10,
          assessedCount: progress ? progress.assessed_count : 0,
          weakMilestones: weakMilestones.map(wm => ({
            id: wm.id,
            subdomain: wm.subdomain,
            level: wm.current_level || 1.0
          })),
          riskLevel: gap > 1.5 ? 'high' : 'moderate'
        });
      }
    }

    atRisk.sort((a, b) => b.gap - a.gap);
    return atRisk;
  }

  /**
   * Generate cohort statistics for a program
   */
  generateCohortSnapshot(programId) {
    const program = this.db.prepare('SELECT id FROM programs WHERE id = ?').get(programId);
    if (!program) return null;

    const metricTypes = ['quiz_accuracy', 'cases_reviewed', 'milestone_avg', 'oral_board_score'];
    const snapshotDate = new Date().toISOString().split('T')[0];
    const results = [];

    // Get active residents grouped by PGY year
    const pgyYears = this.db.prepare(`
      SELECT DISTINCT pgy_year FROM program_members
      WHERE program_id = ? AND status = 'active' AND role = 'resident' AND pgy_year IS NOT NULL
    `).all(programId);

    for (const { pgy_year } of pgyYears) {
      const residents = this.db.prepare(`
        SELECT user_id FROM program_members
        WHERE program_id = ? AND pgy_year = ? AND status = 'active' AND role = 'resident'
      `).all(programId, pgy_year);

      const userIds = residents.map(r => r.user_id);
      if (userIds.length === 0) continue;

      for (const metricType of metricTypes) {
        const values = [];

        for (const userId of userIds) {
          let value = null;

          if (metricType === 'quiz_accuracy') {
            const result = this.db.prepare(`
              SELECT AVG(correct) * 100 as accuracy
              FROM quiz_attempts WHERE user_id = ?
            `).get(userId);
            value = result ? result.accuracy : null;
          } else if (metricType === 'cases_reviewed') {
            const result = this.db.prepare(`
              SELECT COUNT(DISTINCT case_id) as count
              FROM user_case_progress WHERE user_id = ?
            `).get(userId);
            value = result ? result.count : 0;
          } else if (metricType === 'milestone_avg') {
            const result = this.db.prepare(`
              SELECT AVG(current_level) as avg_level
              FROM milestone_progress WHERE user_id = ?
            `).get(userId);
            value = result ? result.avg_level : null;
          } else if (metricType === 'oral_board_score') {
            const result = this.db.prepare(`
              SELECT AVG(score) as avg_score
              FROM oral_board_sessions WHERE user_id = ? AND status = 'completed' AND score IS NOT NULL
            `).get(userId);
            value = result ? result.avg_score : null;
          }

          if (value !== null && value !== undefined) {
            values.push(value);
          }
        }

        if (values.length === 0) continue;

        values.sort((a, b) => a - b);
        const percentiles = {
          p10: this._percentile(values, 10),
          p25: this._percentile(values, 25),
          p50: this._percentile(values, 50),
          p75: this._percentile(values, 75),
          p90: this._percentile(values, 90),
          mean: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
        };

        this.db.prepare(`
          INSERT INTO cohort_snapshots (program_id, snapshot_date, pgy_year, metric_type, percentiles, sample_size)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(programId, snapshotDate, pgy_year, metricType, JSON.stringify(percentiles), values.length);

        results.push({ pgyYear: pgy_year, metricType, percentiles, sampleSize: values.length });
      }
    }

    return results;
  }

  _percentile(sortedArr, p) {
    if (sortedArr.length === 0) return 0;
    const idx = (p / 100) * (sortedArr.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return Math.round(sortedArr[lower] * 10) / 10;
    const weight = idx - lower;
    return Math.round((sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight) * 10) / 10;
  }

  /**
   * Auto-tag a case to milestones based on body_part, modality, difficulty
   */
  autoTagCase(caseId) {
    const caseData = this.db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!caseData) return [];

    const milestones = this.db.prepare('SELECT * FROM acgme_milestones').all();
    const tags = [];

    for (const m of milestones) {
      const bodyParts = JSON.parse(m.body_parts || '[]');
      const modalities = JSON.parse(m.modalities || '[]');

      if (this._matchesMilestone(caseData.body_part, caseData.modality, bodyParts, modalities)) {
        let relevance = 0.5; // base relevance

        // PC2 (Image Interpretation) is always relevant
        if (m.id === 'DR-PC2') relevance = 1.0;
        // MK1 (Clinical Knowledge) is always relevant
        else if (m.id === 'DR-MK1') relevance = 0.9;
        // PC1 (Consultative Role) for higher difficulty
        else if (m.id === 'DR-PC1' && (caseData.difficulty || 2) >= 3) relevance = 0.8;
        // PC3 (Procedures) only for procedure-related modalities
        else if (m.id === 'DR-PC3') {
          if (['fluoroscopy', 'US'].some(mod => (caseData.modality || '').toLowerCase().includes(mod.toLowerCase()))) {
            relevance = 0.7;
          } else {
            continue; // skip if not procedure-relevant
          }
        }
        // ICS3 (Reporting) is relevant for all cases
        else if (m.id === 'DR-ICS3') relevance = 0.6;

        tags.push({ caseId, milestoneId: m.id, relevance: Math.round(relevance * 100) / 100 });

        this.db.prepare(`
          INSERT OR REPLACE INTO case_milestones (case_id, milestone_id, relevance_score)
          VALUES (?, ?, ?)
        `).run(caseId, m.id, relevance);
      }
    }

    return tags;
  }

  /**
   * Calculate CME credits for an activity
   */
  calculateCMECredits(activityType, activityData) {
    let credits = 0;
    let category = 'SA-CME';
    let title = '';

    switch (activityType) {
      case 'case_review':
        // 0.25 credits per case review
        credits = 0.25;
        category = 'SA-CME';
        title = `Case Review: ${activityData.caseTitle || 'Unknown'}`;
        break;
      case 'quiz_session':
        // 0.5 credits per 10 questions answered
        credits = Math.floor((activityData.questionCount || 0) / 10) * 0.5;
        category = 'SA-CME';
        title = `Quiz Session: ${activityData.questionCount || 0} questions`;
        break;
      case 'oral_board':
        // 1 credit per completed oral board session
        credits = 1.0;
        category = 'SA-CME';
        title = `Oral Board Simulation: ${activityData.caseTitle || 'Unknown'}`;
        break;
      case 'collection_complete':
        // 2 credits for completing a collection
        credits = 2.0;
        category = 'CME';
        title = `Collection Completed: ${activityData.collectionName || 'Unknown'}`;
        break;
      default:
        return null;
    }

    if (credits <= 0) return null;

    return { credits, category, title, activityType };
  }
}

module.exports = MilestoneEngine;
