const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { evaluateBadges } = require('../lib/badge-evaluator');

const router = express.Router();

// XP required for a given level: 50 * n * (n - 1)
function xpForLevel(n) {
  return Math.floor(50 * n * (n - 1));
}

function levelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

// Calculate XP for a quiz attempt
function calculateXp(correct, difficulty, timeSpentMs, currentStreakCorrect) {
  let xp = 0;
  if (correct) {
    xp = 10 + (difficulty || 2) * 2;
    // Speed bonuses
    const seconds = (timeSpentMs || 0) / 1000;
    if (seconds > 0 && seconds < 8) xp += 10;
    else if (seconds > 0 && seconds < 15) xp += 5;
    // Streak bonus (3+ correct in a row)
    if (currentStreakCorrect >= 3) xp += 5;
  } else {
    xp = 2; // participation XP
  }
  return xp;
}

// Award XP to a user and update level/streak
function awardXp(db, userId, amount, reason, sessionId, caseId) {
  // Ensure user_xp row exists
  db.prepare('INSERT OR IGNORE INTO user_xp (user_id) VALUES (?)').run(userId);

  // Add XP
  db.prepare('UPDATE user_xp SET total_xp = total_xp + ? WHERE user_id = ?').run(amount, userId);

  // Log transaction
  db.prepare(`
    INSERT INTO xp_transactions (user_id, amount, reason, session_id, case_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, amount, reason, sessionId, caseId);

  // Update level
  const xpRow = db.prepare('SELECT total_xp FROM user_xp WHERE user_id = ?').get(userId);
  const newLevel = levelFromXp(xpRow.total_xp);
  db.prepare('UPDATE user_xp SET level = ? WHERE user_id = ?').run(newLevel, userId);

  return { totalXp: xpRow.total_xp, level: newLevel };
}

// Update study streak
function updateStreak(db, userId) {
  const today = new Date().toISOString().split('T')[0];
  const xpRow = db.prepare('SELECT * FROM user_xp WHERE user_id = ?').get(userId);
  if (!xpRow) return { current_streak: 1, isNewDay: true };

  const lastDate = xpRow.last_study_date;
  let streak = xpRow.current_streak || 0;
  let isNewDay = false;

  if (lastDate !== today) {
    isNewDay = true;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate === yesterdayStr) {
      streak += 1;
    } else if (!lastDate) {
      streak = 1;
    } else {
      streak = 1; // streak broken
    }

    const longest = Math.max(streak, xpRow.longest_streak || 0);
    db.prepare('UPDATE user_xp SET current_streak = ?, longest_streak = ?, last_study_date = ? WHERE user_id = ?')
      .run(streak, longest, today, userId);
  }

  return { current_streak: streak, isNewDay };
}

module.exports = function(db) {

  // GET /api/gamification/profile - XP, level, badges, streaks
  router.get('/profile', requireAuth, (req, res) => {
    const userId = req.user.id;

    db.prepare('INSERT OR IGNORE INTO user_xp (user_id) VALUES (?)').run(userId);
    const xp = db.prepare('SELECT * FROM user_xp WHERE user_id = ?').get(userId);
    const badges = db.prepare(`
      SELECT b.*, ub.earned_at
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      WHERE ub.user_id = ?
      ORDER BY ub.earned_at DESC
    `).all(userId);

    const nextLevelXp = xpForLevel(xp.level + 1);
    const currentLevelXp = xpForLevel(xp.level);

    res.json({
      totalXp: xp.total_xp,
      level: xp.level,
      levelTitle: getLevelTitle(xp.level),
      currentLevelXp,
      nextLevelXp,
      xpProgress: xp.total_xp - currentLevelXp,
      xpNeeded: nextLevelXp - currentLevelXp,
      currentStreak: xp.current_streak,
      longestStreak: xp.longest_streak,
      lastStudyDate: xp.last_study_date,
      badges,
    });
  });

  // GET /api/gamification/leaderboard
  router.get('/leaderboard', (req, res) => {
    const { period = 'weekly' } = req.query;

    let dateFilter = '';
    if (period === 'weekly') {
      dateFilter = "AND xt.created_at >= date('now', '-7 days')";
    } else if (period === 'monthly') {
      dateFilter = "AND xt.created_at >= date('now', '-30 days')";
    }

    const leaderboard = db.prepare(`
      SELECT u.id, u.display_name, u.username,
             COALESCE(SUM(xt.amount), 0) as period_xp,
             ux.level, ux.total_xp
      FROM users u
      LEFT JOIN xp_transactions xt ON u.id = xt.user_id ${dateFilter}
      LEFT JOIN user_xp ux ON u.id = ux.user_id
      GROUP BY u.id
      HAVING period_xp > 0
      ORDER BY period_xp DESC
      LIMIT 20
    `).all();

    res.json({
      period,
      leaderboard: leaderboard.map((entry, i) => ({
        rank: i + 1,
        displayName: entry.display_name || entry.username,
        periodXp: entry.period_xp,
        level: entry.level || 1,
        totalXp: entry.total_xp || 0,
      })),
    });
  });

  // GET /api/gamification/badges - All badges + user's earned
  router.get('/badges', (req, res) => {
    const userId = req.user?.id;
    const allBadges = db.prepare('SELECT * FROM badges').all();
    let earnedIds = new Set();

    if (userId) {
      const earned = db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId);
      earnedIds = new Set(earned.map(b => b.badge_id));
    }

    res.json({
      badges: allBadges.map(b => ({
        ...b,
        earned: earnedIds.has(b.id),
      })),
    });
  });

  // POST /api/gamification/check-badges - Evaluate and award new badges
  router.post('/check-badges', requireAuth, (req, res) => {
    const newBadges = evaluateBadges(db, req.user.id);
    res.json({ newBadges });
  });

  return router;
};

function getLevelTitle(level) {
  if (level >= 50) return 'Department Chair';
  if (level >= 40) return 'Professor';
  if (level >= 30) return 'Attending';
  if (level >= 20) return 'Fellow';
  if (level >= 15) return 'Senior Resident';
  if (level >= 10) return 'Junior Resident';
  if (level >= 5) return 'Intern';
  return 'Medical Student';
}

// Export helpers for use in quiz.js
module.exports.calculateXp = calculateXp;
module.exports.awardXp = awardXp;
module.exports.updateStreak = updateStreak;
module.exports.xpForLevel = xpForLevel;
module.exports.levelFromXp = levelFromXp;
module.exports.getLevelTitle = getLevelTitle;
