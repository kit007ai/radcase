// Badge evaluation logic - checks criteria against user stats and awards badges

const BADGE_DEFINITIONS = [
  // Modality Mastery (80%+ accuracy, 50+ attempts)
  { id: 'ct_scanner', name: 'CT Scanner', description: '80%+ accuracy on 50+ CT cases', icon: '🔬', category: 'modality', rarity: 'silver', criteria: JSON.stringify({ type: 'modality_mastery', modality: 'CT', minAccuracy: 80, minAttempts: 50 }) },
  { id: 'signal_seeker', name: 'Signal Seeker', description: '80%+ accuracy on 50+ MRI cases', icon: '🧲', category: 'modality', rarity: 'silver', criteria: JSON.stringify({ type: 'modality_mastery', modality: 'MRI', minAccuracy: 80, minAttempts: 50 }) },
  { id: 'film_reader', name: 'Film Reader', description: '80%+ accuracy on 50+ X-Ray cases', icon: '📋', category: 'modality', rarity: 'silver', criteria: JSON.stringify({ type: 'modality_mastery', modality: 'X-Ray', minAccuracy: 80, minAttempts: 50 }) },
  { id: 'sound_wave', name: 'Sound Wave', description: '80%+ accuracy on 50+ Ultrasound cases', icon: '🔊', category: 'modality', rarity: 'silver', criteria: JSON.stringify({ type: 'modality_mastery', modality: 'Ultrasound', minAccuracy: 80, minAttempts: 50 }) },

  // Anatomy Expert (80%+ accuracy, 30+ attempts)
  { id: 'chest_champion', name: 'Chest Champion', description: '80%+ accuracy on 30+ Chest cases', icon: '🫁', category: 'anatomy', rarity: 'silver', criteria: JSON.stringify({ type: 'anatomy_mastery', body_part: 'Chest', minAccuracy: 80, minAttempts: 30 }) },
  { id: 'neuro_navigator', name: 'Neuro Navigator', description: '80%+ accuracy on 30+ Head cases', icon: '🧠', category: 'anatomy', rarity: 'silver', criteria: JSON.stringify({ type: 'anatomy_mastery', body_part: 'Head', minAccuracy: 80, minAttempts: 30 }) },
  { id: 'abdominal_ace', name: 'Abdominal Ace', description: '80%+ accuracy on 30+ Abdomen cases', icon: '🎯', category: 'anatomy', rarity: 'silver', criteria: JSON.stringify({ type: 'anatomy_mastery', body_part: 'Abdomen', minAccuracy: 80, minAttempts: 30 }) },
  { id: 'msk_master', name: 'MSK Master', description: '80%+ accuracy on 30+ MSK cases', icon: '🦴', category: 'anatomy', rarity: 'silver', criteria: JSON.stringify({ type: 'anatomy_mastery', body_part: 'MSK', minAccuracy: 80, minAttempts: 30 }) },

  // Streak & Consistency
  { id: 'first_steps', name: 'First Steps', description: 'Complete your first quiz session', icon: '👣', category: 'streak', rarity: 'bronze', criteria: JSON.stringify({ type: 'total_sessions', min: 1 }) },
  { id: 'week_warrior', name: 'Week Warrior', description: '7-day study streak', icon: '🔥', category: 'streak', rarity: 'silver', criteria: JSON.stringify({ type: 'streak', min: 7 }) },
  { id: 'month_master', name: 'Month Master', description: '30-day study streak', icon: '📅', category: 'streak', rarity: 'gold', criteria: JSON.stringify({ type: 'streak', min: 30 }) },
  { id: 'century_club', name: 'Century Club', description: 'Complete 100 quiz cases', icon: '💯', category: 'streak', rarity: 'silver', criteria: JSON.stringify({ type: 'total_attempts', min: 100 }) },
  { id: 'thousand_cases', name: 'Thousand Cases', description: 'Complete 1000 quiz cases', icon: '🏆', category: 'streak', rarity: 'gold', criteria: JSON.stringify({ type: 'total_attempts', min: 1000 }) },

  // Performance
  { id: 'perfect_score', name: 'Perfect Score', description: '100% on a 10+ question session', icon: '⭐', category: 'performance', rarity: 'gold', criteria: JSON.stringify({ type: 'perfect_session', minQuestions: 10 }) },
  { id: 'speed_demon', name: 'Speed Demon', description: 'Average <10s per question in a session', icon: '⚡', category: 'performance', rarity: 'silver', criteria: JSON.stringify({ type: 'speed', maxAvgMs: 10000 }) },
  { id: 'board_ready', name: 'Board Ready', description: 'Board readiness score >80', icon: '🎓', category: 'performance', rarity: 'gold', criteria: JSON.stringify({ type: 'board_readiness', min: 80 }) },
  { id: 'comeback_kid', name: 'Comeback Kid', description: 'Improve a weak area from <50% to >80%', icon: '💪', category: 'performance', rarity: 'gold', criteria: JSON.stringify({ type: 'comeback', fromBelow: 50, toAbove: 80 }) },

  // Case Library Overhaul Badges
  { id: 'differential_master', name: 'Differential Master', description: '10 differential attempts with score >= 80%', icon: '🧪', category: 'performance', rarity: 'gold', criteria: JSON.stringify({ type: 'differential_master', minAttempts: 10, minScore: 0.8 }) },
  { id: 'case_collector', name: 'Case Collector', description: 'Create 3 collections', icon: '📦', category: 'streak', rarity: 'silver', criteria: JSON.stringify({ type: 'case_collector', minCollections: 3 }) },
  { id: 'discussion_contributor', name: 'Discussion Contributor', description: 'Post 10 discussion comments', icon: '💬', category: 'streak', rarity: 'silver', criteria: JSON.stringify({ type: 'discussion_contributor', minComments: 10 }) },
  { id: 'pattern_spotter', name: 'Pattern Spotter', description: 'View all cases in a pattern group', icon: '🔍', category: 'performance', rarity: 'silver', criteria: JSON.stringify({ type: 'pattern_spotter' }) },
  { id: 'study_mode_champion', name: 'Study Mode Champion', description: 'Complete 25 cases in study mode (all 5 steps)', icon: '🏅', category: 'streak', rarity: 'gold', criteria: JSON.stringify({ type: 'study_mode_champion', minCases: 25 }) },
];

function seedBadges(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO badges (id, name, description, icon, category, rarity, criteria)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const badge of BADGE_DEFINITIONS) {
    insert.run(badge.id, badge.name, badge.description, badge.icon, badge.category, badge.rarity, badge.criteria);
  }
}

function evaluateBadges(db, userId) {
  const earned = db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId);
  const earnedIds = new Set(earned.map(b => b.badge_id));
  const allBadges = db.prepare('SELECT * FROM badges').all();
  const newBadges = [];

  for (const badge of allBadges) {
    if (earnedIds.has(badge.id)) continue;

    const criteria = JSON.parse(badge.criteria);
    let met = false;

    switch (criteria.type) {
      case 'modality_mastery': {
        const stats = db.prepare(`
          SELECT COUNT(*) as attempts, SUM(qa.correct) as correct
          FROM quiz_attempts qa
          JOIN cases c ON qa.case_id = c.id
          WHERE qa.user_id = ? AND c.modality = ?
        `).get(userId, criteria.modality);
        if (stats.attempts >= criteria.minAttempts) {
          const accuracy = (stats.correct / stats.attempts) * 100;
          met = accuracy >= criteria.minAccuracy;
        }
        break;
      }
      case 'anatomy_mastery': {
        const stats = db.prepare(`
          SELECT COUNT(*) as attempts, SUM(qa.correct) as correct
          FROM quiz_attempts qa
          JOIN cases c ON qa.case_id = c.id
          WHERE qa.user_id = ? AND c.body_part = ?
        `).get(userId, criteria.body_part);
        if (stats.attempts >= criteria.minAttempts) {
          const accuracy = (stats.correct / stats.attempts) * 100;
          met = accuracy >= criteria.minAccuracy;
        }
        break;
      }
      case 'total_sessions': {
        const count = db.prepare('SELECT COUNT(*) as c FROM quiz_sessions WHERE user_id = ?').get(userId);
        met = (count.c || 0) >= criteria.min;
        break;
      }
      case 'streak': {
        const xp = db.prepare('SELECT current_streak, longest_streak FROM user_xp WHERE user_id = ?').get(userId);
        met = xp && Math.max(xp.current_streak, xp.longest_streak) >= criteria.min;
        break;
      }
      case 'total_attempts': {
        const count = db.prepare('SELECT COUNT(*) as c FROM quiz_attempts WHERE user_id = ?').get(userId);
        met = (count.c || 0) >= criteria.min;
        break;
      }
      case 'perfect_session': {
        const session = db.prepare(`
          SELECT id FROM quiz_sessions
          WHERE user_id = ? AND total_questions >= ? AND correct_count = total_questions AND completed_at IS NOT NULL
          LIMIT 1
        `).get(userId, criteria.minQuestions);
        met = !!session;
        break;
      }
      case 'speed': {
        const session = db.prepare(`
          SELECT qs.id FROM quiz_sessions qs
          WHERE qs.user_id = ? AND qs.completed_at IS NOT NULL AND qs.total_questions >= 5
        `).all(userId);
        for (const s of session) {
          const avg = db.prepare(`
            SELECT AVG(time_spent_ms) as avg_ms FROM quiz_attempts WHERE session_id = ?
          `).get(s.id);
          if (avg && avg.avg_ms && avg.avg_ms < criteria.maxAvgMs) {
            met = true;
            break;
          }
        }
        break;
      }
      case 'board_readiness':
        // Checked separately via analytics endpoint
        break;
      case 'comeback':
        // Complex check - would need historical data, skip for now
        break;
      case 'differential_master': {
        const dAttempts = db.prepare(`
          SELECT COUNT(*) as c FROM differential_attempts
          WHERE user_id = ? AND score >= ?
        `).get(userId, criteria.minScore);
        met = (dAttempts.c || 0) >= criteria.minAttempts;
        break;
      }
      case 'case_collector': {
        const colCount = db.prepare("SELECT COUNT(*) as c FROM collections WHERE created_by = ? AND collection_type = 'custom'").get(userId);
        met = (colCount.c || 0) >= criteria.minCollections;
        break;
      }
      case 'discussion_contributor': {
        const commentCount = db.prepare('SELECT COUNT(*) as c FROM case_discussions WHERE user_id = ?').get(userId);
        met = (commentCount.c || 0) >= criteria.minComments;
        break;
      }
      case 'pattern_spotter':
        // Tracked client-side via localStorage, not easily verifiable server-side
        break;
      case 'study_mode_champion':
        // Study mode completion tracked via differential_attempts as proxy
        // (completing study mode means submitting a differential for a case)
        {
          const studyCount = db.prepare('SELECT COUNT(DISTINCT case_id) as c FROM differential_attempts WHERE user_id = ?').get(userId);
          met = (studyCount.c || 0) >= criteria.minCases;
        }
        break;
    }

    if (met) {
      db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badge.id);
      newBadges.push(badge);
    }
  }

  return newBadges;
}

module.exports = { seedBadges, evaluateBadges, BADGE_DEFINITIONS };
