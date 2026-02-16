const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = function(db) {

  // GET /api/analytics/deep - All dashboard data in one call
  router.get('/deep', (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.json({ error: 'Login required for deep analytics', authenticated: false });
    }

    // Performance by body part
    const performanceByBodyPart = db.prepare(`
      SELECT c.body_part,
             COUNT(*) as attempts,
             SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ? AND c.body_part IS NOT NULL
      GROUP BY c.body_part
      ORDER BY attempts DESC
    `).all(userId);

    // Performance by modality
    const performanceByModality = db.prepare(`
      SELECT c.modality,
             COUNT(*) as attempts,
             SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ? AND c.modality IS NOT NULL
      GROUP BY c.modality
      ORDER BY attempts DESC
    `).all(userId);

    // Performance trends (daily, last 30 days)
    const performanceTrends = db.prepare(`
      SELECT DATE(qa.attempted_at) as date,
             COUNT(*) as attempts,
             SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      WHERE qa.user_id = ? AND qa.attempted_at >= date('now', '-30 days')
      GROUP BY DATE(qa.attempted_at)
      ORDER BY date
    `).all(userId);

    // Coverage map: how many body_part/modality combos attempted
    const allCombos = db.prepare(`
      SELECT DISTINCT body_part, modality FROM cases
      WHERE body_part IS NOT NULL AND modality IS NOT NULL
    `).all();
    const attemptedCombos = db.prepare(`
      SELECT DISTINCT c.body_part, c.modality
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ? AND c.body_part IS NOT NULL AND c.modality IS NOT NULL
    `).all(userId);

    // Board readiness
    const boardReadiness = calculateBoardReadiness(db, userId, allCombos, attemptedCombos, performanceTrends);

    // Streak data (30-day heatmap)
    const streakData = db.prepare(`
      SELECT DATE(attempted_at) as date, COUNT(*) as count
      FROM quiz_attempts
      WHERE user_id = ? AND attempted_at >= date('now', '-30 days')
      GROUP BY DATE(attempted_at)
      ORDER BY date
    `).all(userId);

    // Weakest cases (bottom 10 diagnoses by accuracy)
    const weakestCases = db.prepare(`
      SELECT c.id, c.title, c.diagnosis, c.body_part, c.modality, c.difficulty,
             COUNT(*) as attempts,
             SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ?
      GROUP BY c.id
      HAVING attempts >= 2
      ORDER BY accuracy ASC, attempts DESC
      LIMIT 10
    `).all(userId);

    // Difficulty spread
    const difficultySpread = db.prepare(`
      SELECT c.difficulty, COUNT(*) as attempts, SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ?
      GROUP BY c.difficulty
      ORDER BY c.difficulty
    `).all(userId);

    res.json({
      performanceByBodyPart,
      performanceByModality,
      performanceTrends,
      coverageMap: {
        total: allCombos.length,
        attempted: attemptedCombos.length,
        percentage: allCombos.length > 0 ? Math.round((attemptedCombos.length / allCombos.length) * 100) : 0,
      },
      boardReadiness,
      streakData,
      weakestCases,
      difficultySpread,
      authenticated: true,
    });
  });

  // GET /api/analytics/trends - Time-series data
  router.get('/trends', requireAuth, (req, res) => {
    const { period = 'daily' } = req.query;
    const userId = req.user.id;

    let groupBy, dateRange;
    if (period === 'weekly') {
      groupBy = "strftime('%Y-W%W', qa.attempted_at)";
      dateRange = "date('now', '-90 days')";
    } else if (period === 'monthly') {
      groupBy = "strftime('%Y-%m', qa.attempted_at)";
      dateRange = "date('now', '-365 days')";
    } else {
      groupBy = "DATE(qa.attempted_at)";
      dateRange = "date('now', '-30 days')";
    }

    const trends = db.prepare(`
      SELECT ${groupBy} as period,
             COUNT(*) as attempts,
             SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      WHERE qa.user_id = ? AND qa.attempted_at >= ${dateRange}
      GROUP BY ${groupBy}
      ORDER BY period
    `).all(userId);

    res.json({ period, trends });
  });

  // GET /api/analytics/board-readiness
  router.get('/board-readiness', requireAuth, (req, res) => {
    const userId = req.user.id;
    const allCombos = db.prepare(`
      SELECT DISTINCT body_part, modality FROM cases
      WHERE body_part IS NOT NULL AND modality IS NOT NULL
    `).all();
    const attemptedCombos = db.prepare(`
      SELECT DISTINCT c.body_part, c.modality
      FROM quiz_attempts qa JOIN cases c ON qa.case_id = c.id
      WHERE qa.user_id = ? AND c.body_part IS NOT NULL AND c.modality IS NOT NULL
    `).all(userId);
    const trends = db.prepare(`
      SELECT DATE(qa.attempted_at) as date, COUNT(*) as attempts, SUM(qa.correct) as correct,
             ROUND(CAST(SUM(qa.correct) AS FLOAT) / COUNT(*) * 100, 1) as accuracy
      FROM quiz_attempts qa
      WHERE qa.user_id = ? AND qa.attempted_at >= date('now', '-30 days')
      GROUP BY DATE(qa.attempted_at) ORDER BY date
    `).all(userId);

    res.json(calculateBoardReadiness(db, userId, allCombos, attemptedCombos, trends));
  });

  return router;
};

function calculateBoardReadiness(db, userId, allCombos, attemptedCombos, performanceTrends) {
  // Factor 1: Coverage (20pts)
  const coverageScore = allCombos.length > 0
    ? Math.min(20, Math.round((attemptedCombos.length / allCombos.length) * 20))
    : 0;

  // Factor 2: Accuracy (20pts) - weighted by difficulty
  const accuracyData = db.prepare(`
    SELECT c.difficulty, COUNT(*) as attempts, SUM(qa.correct) as correct
    FROM quiz_attempts qa JOIN cases c ON qa.case_id = c.id
    WHERE qa.user_id = ?
    GROUP BY c.difficulty
  `).all(userId);

  let weightedCorrect = 0, weightedTotal = 0;
  for (const row of accuracyData) {
    const weight = (row.difficulty || 2) / 3; // normalize around difficulty 3
    weightedCorrect += (row.correct || 0) * weight;
    weightedTotal += row.attempts * weight;
  }
  const accuracyScore = weightedTotal > 0
    ? Math.min(20, Math.round((weightedCorrect / weightedTotal) * 20))
    : 0;

  // Factor 3: Consistency (20pts) - study days in last 30
  const studyDays = performanceTrends.length;
  const consistencyScore = Math.min(20, Math.round((studyDays / 20) * 20));

  // Factor 4: Difficulty Spread (20pts) - attempted across all 5 levels
  const diffLevels = db.prepare(`
    SELECT DISTINCT c.difficulty
    FROM quiz_attempts qa JOIN cases c ON qa.case_id = c.id
    WHERE qa.user_id = ?
  `).all(userId);
  const spreadScore = Math.min(20, diffLevels.length * 4);

  // Factor 5: Retention (20pts) - mastered cases in spaced rep
  const mastered = db.prepare(`
    SELECT COUNT(*) as c FROM user_case_progress
    WHERE user_id = ? AND repetitions >= 3 AND interval_days >= 21
  `).get(userId);
  const totalCases = db.prepare('SELECT COUNT(*) as c FROM cases').get();
  const retentionScore = totalCases.c > 0
    ? Math.min(20, Math.round(((mastered.c || 0) / totalCases.c) * 20))
    : 0;

  const total = coverageScore + accuracyScore + consistencyScore + spreadScore + retentionScore;

  return {
    score: total,
    breakdown: {
      coverage: { score: coverageScore, max: 20, detail: `${attemptedCombos.length}/${allCombos.length} combos` },
      accuracy: { score: accuracyScore, max: 20, detail: weightedTotal > 0 ? `${Math.round((weightedCorrect / weightedTotal) * 100)}% weighted` : 'No data' },
      consistency: { score: consistencyScore, max: 20, detail: `${studyDays}/20 days` },
      difficultySpread: { score: spreadScore, max: 20, detail: `${diffLevels.length}/5 levels` },
      retention: { score: retentionScore, max: 20, detail: `${mastered.c || 0} mastered` },
    },
  };
}
