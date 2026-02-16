const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { calculateXp, awardXp, updateStreak } = require('./gamification');
const { evaluateBadges } = require('../lib/badge-evaluator');
const { getOrCreateDailyChallenge } = require('../lib/daily-challenge');

const router = express.Router();

// SM-2 Spaced Repetition Algorithm
function updateSpacedRepetition(db, userId, caseId, quality) {
  // quality: 0 = wrong, 1 = correct
  const grade = quality ? 4 : 1; // Map to 0-5 scale (1=wrong, 4=correct)

  let progress = db.prepare('SELECT * FROM user_case_progress WHERE user_id = ? AND case_id = ?').get(userId, caseId);

  if (!progress) {
    progress = { ease_factor: 2.5, interval_days: 1, repetitions: 0 };
  }

  let { ease_factor, interval_days, repetitions } = progress;

  if (grade >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval_days = 1;
    } else if (repetitions === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
    repetitions++;
  } else {
    // Wrong response - reset
    repetitions = 0;
    interval_days = 1;
  }

  // Update ease factor
  ease_factor = ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (ease_factor < 1.3) ease_factor = 1.3;

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval_days);

  db.prepare(`
    INSERT OR REPLACE INTO user_case_progress (user_id, case_id, ease_factor, interval_days, repetitions, next_review, last_reviewed)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(userId, caseId, ease_factor, interval_days, repetitions, nextReview.toISOString().split('T')[0]);
}

module.exports = function(db) {
  // Get random case for quiz
  router.get('/random', (req, res) => {
    const { modality, body_part, difficulty } = req.query;

    let sql = `
      SELECT c.id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty,
             c.clinical_history, c.findings, c.teaching_points,
             (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as image
      FROM cases c
    `;

    const conditions = [];
    const params = [];

    if (modality) {
      conditions.push('c.modality = ?');
      params.push(modality);
    }
    if (body_part) {
      conditions.push('c.body_part = ?');
      params.push(body_part);
    }
    if (difficulty) {
      conditions.push('c.difficulty = ?');
      params.push(parseInt(difficulty));
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY RANDOM() LIMIT 1';

    const quizCase = db.prepare(sql).get(...params);

    if (!quizCase) {
      return res.status(404).json({ error: 'No cases found matching criteria' });
    }

    const images = db.prepare('SELECT * FROM images WHERE case_id = ? ORDER BY sequence').all(quizCase.id);

    res.json({ ...quizCase, images });
  });

  // Submit quiz attempt (extended with XP + session tracking)
  router.post('/attempt', (req, res) => {
    const { case_id, correct, time_spent_ms, session_id, answer_index, correct_index } = req.body;
    const userId = req.user?.id || null;

    if (!case_id) {
      return res.status(400).json({ error: 'case_id is required' });
    }

    const caseData = db.prepare('SELECT id, difficulty FROM cases WHERE id = ?').get(case_id);
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    let xpEarned = 0;
    let streakInfo = null;
    let levelUp = false;
    let newBadges = [];
    let sessionCorrectStreak = 0;

    // Calculate correct streak within session for streak bonus
    if (session_id && userId) {
      const recentAttempts = db.prepare(`
        SELECT correct FROM quiz_attempts WHERE session_id = ? AND user_id = ?
        ORDER BY id DESC LIMIT 10
      `).all(session_id, userId);
      for (const a of recentAttempts) {
        if (a.correct) sessionCorrectStreak++;
        else break;
      }
    }

    // Calculate and award XP for logged-in users
    if (userId) {
      xpEarned = calculateXp(correct, caseData.difficulty, time_spent_ms, sessionCorrectStreak);
      const oldLevel = db.prepare('SELECT level FROM user_xp WHERE user_id = ?').get(userId);
      const oldLevelNum = oldLevel?.level || 1;

      const xpResult = awardXp(db, userId, xpEarned, correct ? 'correct_answer' : 'incorrect_answer', session_id, case_id);
      levelUp = xpResult.level > oldLevelNum;

      streakInfo = updateStreak(db, userId);
      if (streakInfo.isNewDay) {
        const dayBonus = 15;
        awardXp(db, userId, dayBonus, 'first_session_of_day', session_id, null);
        xpEarned += dayBonus;
      }
    }

    // Record the attempt
    db.prepare(`
      INSERT INTO quiz_attempts (case_id, correct, time_spent_ms, user_id, session_id, answer_index, correct_index, xp_earned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(case_id, correct ? 1 : 0, time_spent_ms || 0, userId, session_id || null, answer_index ?? null, correct_index ?? null, xpEarned);

    // Update session stats
    if (session_id) {
      db.prepare(`
        UPDATE quiz_sessions SET total_questions = total_questions + 1,
        correct_count = correct_count + ?, xp_earned = xp_earned + ?
        WHERE id = ?
      `).run(correct ? 1 : 0, xpEarned, session_id);
    }

    // Update spaced repetition
    if (userId) {
      updateSpacedRepetition(db, userId, case_id, correct ? 1 : 0);
    }

    // Check for new badges (async, don't block response)
    if (userId) {
      try { newBadges = evaluateBadges(db, userId); } catch (e) {}
    }

    res.json({
      message: 'Attempt recorded',
      xpEarned,
      levelUp,
      newBadges: newBadges.map(b => ({ id: b.id, name: b.name, icon: b.icon, rarity: b.rarity })),
      streak: streakInfo?.current_streak || 0,
    });
  });

  // POST /api/quiz/session - Create a new quiz session
  router.post('/session', (req, res) => {
    const { mode, planId } = req.body;
    const userId = req.user?.id;
    const sessionId = uuidv4();

    db.prepare(`
      INSERT INTO quiz_sessions (id, user_id, mode, plan_id)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, userId || 'guest', mode || 'quick', planId || null);

    res.json({ sessionId });
  });

  // POST /api/quiz/session/:id/complete - Complete a session
  router.post('/session/:id/complete', (req, res) => {
    const session = db.prepare('SELECT * FROM quiz_sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    db.prepare('UPDATE quiz_sessions SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const userId = req.user?.id;
    let bonusXp = 0;

    // Perfect session bonus
    if (userId && session.total_questions >= 5 && session.correct_count === session.total_questions) {
      bonusXp += 30;
      awardXp(db, userId, 30, 'perfect_session', req.params.id, null);
    }

    // Check for new badges after session complete
    let newBadges = [];
    if (userId) {
      try { newBadges = evaluateBadges(db, userId); } catch (e) {}
    }

    res.json({
      completed: true,
      totalQuestions: session.total_questions,
      correctCount: session.correct_count,
      xpEarned: session.xp_earned + bonusXp,
      bonusXp,
      newBadges: newBadges.map(b => ({ id: b.id, name: b.name, icon: b.icon, rarity: b.rarity })),
    });
  });

  // GET /api/quiz/daily-challenge - Get today's challenge
  router.get('/daily-challenge', (req, res) => {
    const challenge = getOrCreateDailyChallenge(db);
    if (!challenge) return res.json({ available: false });

    const userId = req.user?.id;
    let completed = false;
    if (userId) {
      const result = db.prepare('SELECT * FROM user_daily_challenge WHERE user_id = ? AND challenge_date = ?')
        .get(userId, challenge.date);
      if (result) completed = true;
    }

    // Load case data
    const cases = challenge.caseIds.map(id => {
      const c = db.prepare(`
        SELECT c.*, (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
        FROM cases c WHERE c.id = ?
      `).get(id);
      return c;
    }).filter(Boolean);

    res.json({
      available: true,
      date: challenge.date,
      completed,
      cases: completed ? [] : cases,
      caseCount: challenge.caseIds.length,
    });
  });

  // POST /api/quiz/daily-challenge - Submit daily challenge results
  router.post('/daily-challenge', requireAuth, (req, res) => {
    const { score, total } = req.body;
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const existing = db.prepare('SELECT * FROM user_daily_challenge WHERE user_id = ? AND challenge_date = ?')
      .get(userId, today);
    if (existing) return res.status(400).json({ error: 'Already completed today' });

    let xpEarned = 50; // completion bonus
    if (score === total) xpEarned += 25; // perfect bonus

    awardXp(db, userId, xpEarned, 'daily_challenge', null, null);

    db.prepare(`
      INSERT INTO user_daily_challenge (user_id, challenge_date, score, total, xp_earned)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, today, score, total, xpEarned);

    res.json({ xpEarned, perfect: score === total });
  });

  // POST /api/quiz/finding-attempt - Submit "find the finding" attempt
  router.post('/finding-attempt', (req, res) => {
    const { case_id, image_id, click_x, click_y } = req.body;

    const regions = db.prepare('SELECT * FROM case_finding_regions WHERE case_id = ? AND image_id = ?')
      .all(case_id, image_id);

    if (regions.length === 0) {
      return res.json({ hit: false, message: 'No finding regions defined', regions: [] });
    }

    let hit = false;
    let bestDistance = Infinity;
    let closestRegion = null;

    for (const region of regions) {
      const data = JSON.parse(region.region_data);
      const distance = calculateDistance(click_x, click_y, data);
      if (distance < bestDistance) {
        bestDistance = distance;
        closestRegion = region;
      }
      if (distance <= 1.0) hit = true;
    }

    res.json({
      hit,
      partialCredit: !hit && bestDistance <= 1.5,
      regions: regions.map(r => ({ ...r, region_data: JSON.parse(r.region_data) })),
      closestDistance: bestDistance,
    });
  });

  // GET /api/quiz/mcq-options/:caseId - Generate MCQ options for a case
  router.get('/mcq-options/:caseId', (req, res) => {
    const caseData = db.prepare('SELECT * FROM cases WHERE id = ?').get(req.params.caseId);
    if (!caseData || !caseData.diagnosis) {
      return res.status(404).json({ error: 'Case not found or has no diagnosis' });
    }

    // Get plausible distractors from same body_part/modality
    const distractors = db.prepare(`
      SELECT DISTINCT diagnosis FROM cases
      WHERE id != ? AND diagnosis IS NOT NULL AND diagnosis != ''
        AND (body_part = ? OR modality = ?)
      ORDER BY RANDOM() LIMIT 10
    `).all(caseData.id, caseData.body_part, caseData.modality);

    const wrongAnswers = [];
    for (const d of distractors) {
      if (d.diagnosis !== caseData.diagnosis && !wrongAnswers.includes(d.diagnosis)) {
        wrongAnswers.push(d.diagnosis);
        if (wrongAnswers.length >= 3) break;
      }
    }

    // Fallback distractors
    if (wrongAnswers.length < 3) {
      const fallbacks = db.prepare(`
        SELECT DISTINCT diagnosis FROM cases
        WHERE id != ? AND diagnosis IS NOT NULL AND diagnosis != ? AND diagnosis != ''
        ORDER BY RANDOM() LIMIT ?
      `).all(caseData.id, caseData.diagnosis, 3 - wrongAnswers.length);
      for (const d of fallbacks) {
        if (!wrongAnswers.includes(d.diagnosis)) wrongAnswers.push(d.diagnosis);
      }
    }

    const staticFallbacks = ['Normal study', 'Artifact', 'Incidental finding'];
    while (wrongAnswers.length < 3) {
      const f = staticFallbacks[wrongAnswers.length];
      if (f && f !== caseData.diagnosis) wrongAnswers.push(f);
      else break;
    }

    // Shuffle options, track correct index
    const options = [caseData.diagnosis, ...wrongAnswers];
    // Fisher-Yates shuffle
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    const correctIndex = options.indexOf(caseData.diagnosis);

    res.json({ options, correctIndex });
  });

  // Get quiz stats (user-specific if logged in)
  router.get('/stats', (req, res) => {
    const userId = req.user?.id;
    const userFilter = userId ? 'WHERE qa.user_id = ?' : '';
    const userParams = userId ? [userId] : [];

    const overall = db.prepare(`
      SELECT
        COUNT(*) as total_attempts,
        SUM(correct) as correct_count,
        AVG(time_spent_ms) as avg_time_ms
      FROM quiz_attempts qa
      ${userFilter}
    `).get(...userParams);

    const byDifficulty = db.prepare(`
      SELECT
        c.difficulty,
        COUNT(*) as attempts,
        SUM(qa.correct) as correct,
        AVG(qa.time_spent_ms) as avg_time_ms
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      ${userId ? 'WHERE qa.user_id = ?' : ''}
      GROUP BY c.difficulty
      ORDER BY c.difficulty
    `).all(...userParams);

    const recentMisses = db.prepare(`
      SELECT c.id, c.title, c.diagnosis, c.difficulty, COUNT(*) as miss_count
      FROM quiz_attempts qa
      JOIN cases c ON qa.case_id = c.id
      WHERE qa.correct = 0 ${userId ? 'AND qa.user_id = ?' : ''}
      GROUP BY c.id
      ORDER BY miss_count DESC, qa.attempted_at DESC
      LIMIT 5
    `).all(...userParams);

    res.json({ overall, byDifficulty, recentMisses, isPersonal: !!userId });
  });

  // Get cases due for review (spaced repetition)
  router.get('/review/due', requireAuth, (req, res) => {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    const dueCases = db.prepare(`
      SELECT c.*, ucp.next_review, ucp.repetitions, ucp.interval_days,
             (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
      FROM user_case_progress ucp
      JOIN cases c ON ucp.case_id = c.id
      WHERE ucp.user_id = ? AND ucp.next_review <= date('now')
      ORDER BY ucp.next_review ASC
      LIMIT ?
    `).all(userId, parseInt(limit));

    const newCases = db.prepare(`
      SELECT c.*,
             (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
      FROM cases c
      WHERE c.id NOT IN (SELECT case_id FROM user_case_progress WHERE user_id = ?)
      ORDER BY RANDOM()
      LIMIT ?
    `).all(userId, Math.max(0, parseInt(limit) - dueCases.length));

    res.json({
      dueCases,
      newCases,
      totalDue: dueCases.length,
      totalNew: newCases.length
    });
  });

  // Get user progress summary
  router.get('/progress', requireAuth, (req, res) => {
    const userId = req.user.id;

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_attempts,
        SUM(correct) as correct_count,
        COUNT(DISTINCT case_id) as unique_cases
      FROM quiz_attempts
      WHERE user_id = ?
    `).get(userId);

    const streakData = db.prepare(`
      SELECT DATE(attempted_at) as day, COUNT(*) as attempts
      FROM quiz_attempts
      WHERE user_id = ?
      GROUP BY DATE(attempted_at)
      ORDER BY day DESC
      LIMIT 30
    `).all(userId);

    const masteredCases = db.prepare(`
      SELECT COUNT(*) as count
      FROM user_case_progress
      WHERE user_id = ? AND repetitions >= 3 AND interval_days >= 21
    `).get(userId);

    const learningCases = db.prepare(`
      SELECT COUNT(*) as count
      FROM user_case_progress
      WHERE user_id = ? AND repetitions > 0 AND (repetitions < 3 OR interval_days < 21)
    `).get(userId);

    res.json({
      totalAttempts: stats.total_attempts || 0,
      correctCount: stats.correct_count || 0,
      accuracy: stats.total_attempts ? Math.round((stats.correct_count / stats.total_attempts) * 100) : 0,
      uniqueCases: stats.unique_cases || 0,
      masteredCases: masteredCases.count || 0,
      learningCases: learningCases.count || 0,
      streakData
    });
  });

  return router;
};

// Export for use by sync routes
module.exports.updateSpacedRepetition = updateSpacedRepetition;

// Calculate distance from click to region (normalized: <=1.0 = inside, 1.0-1.5 = partial)
function calculateDistance(clickX, clickY, regionData) {
  if (regionData.type === 'ellipse') {
    const { cx, cy, rx, ry } = regionData;
    const dx = (clickX - cx) / rx;
    const dy = (clickY - cy) / ry;
    return Math.sqrt(dx * dx + dy * dy);
  } else if (regionData.type === 'rect') {
    const { x, y, w, h } = regionData;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const dx = Math.max(0, Math.abs(clickX - cx) - w / 2) / (w / 2);
    const dy = Math.max(0, Math.abs(clickY - cy) - h / 2) / (h / 2);
    return Math.sqrt(dx * dx + dy * dy);
  }
  return Infinity;
}
