// Seed realistic quiz history for erica_demo so analytics dashboard populates
// for Erica's paper figures. ~60 attempts across 4 weeks, varied difficulty,
// realistic accuracy/time distribution.
const Database = require('better-sqlite3');
const crypto = require('crypto');

const ERICA_ID = '1fa5dab5-c5f6-40fd-a851-52c5ebc8f18b';
const db = new Database('/home/kitkat/projects/radcase/radcase.db');

// Wipe any prior seeded attempts for erica (idempotent)
db.prepare('DELETE FROM quiz_attempts WHERE user_id = ?').run(ERICA_ID);
db.prepare('DELETE FROM quiz_sessions WHERE user_id = ?').run(ERICA_ID);
db.prepare('DELETE FROM differential_attempts WHERE user_id = ?').run(ERICA_ID);

// Get cases with full data
const cases = db.prepare("SELECT id, title, difficulty, modality, body_part FROM cases WHERE difficulty IS NOT NULL").all();
console.log('Available cases:', cases.length);

// Realistic learning curve: starts at ~55% week 1, climbs to ~85% week 4
// Difficulty matters: easy=+15%, medium=baseline, hard=-15%
function answeredCorrect(week, difficulty) {
  const base = 0.55 + (week - 1) * 0.10; // 0.55, 0.65, 0.75, 0.85
  const diffMod = difficulty === 1 ? 0.15 : difficulty === 2 ? 0 : -0.15;
  const p = Math.min(0.95, Math.max(0.20, base + diffMod));
  return Math.random() < p ? 1 : 0;
}

function timeSpent(difficulty, correct) {
  // milliseconds — easy/correct ~ 8s, hard/wrong ~ 35s
  const base = 7000 + difficulty * 6000;
  const correctMod = correct ? 0.85 : 1.4;
  return Math.round(base * correctMod * (0.8 + Math.random() * 0.4));
}

const insertAttempt = db.prepare(`
  INSERT INTO quiz_attempts
    (case_id, correct, time_spent_ms, attempted_at, user_id, session_id, answer_index, correct_index, xp_earned)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertSession = db.prepare(`
  INSERT INTO quiz_sessions
    (id, user_id, mode, started_at, completed_at, total_questions, correct_count, xp_earned)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Generate ~12 sessions over 28 days; each session ~5 questions
const now = new Date('2026-05-26T13:00:00-07:00');
const dayMs = 24 * 60 * 60 * 1000;

let totalAttempts = 0;
let totalCorrect = 0;
let totalXp = 0;

for (let s = 0; s < 14; s++) {
  // Distribute sessions across 4 weeks
  const daysAgo = Math.floor((s / 14) * 28) + Math.floor(Math.random() * 2);
  const sessionStart = new Date(now.getTime() - (28 - daysAgo) * dayMs - Math.floor(Math.random() * 12) * 60 * 60 * 1000);
  const week = 4 - Math.floor((28 - daysAgo) / 7);
  const sessionId = crypto.randomUUID();
  const mode = ['quick', 'rapid_review', 'modality_focus', 'oral_board'][Math.floor(Math.random() * 4)];

  // 4-7 questions per session
  const qCount = 4 + Math.floor(Math.random() * 4);
  const picks = [];
  for (let i = 0; i < qCount; i++) {
    picks.push(cases[Math.floor(Math.random() * cases.length)]);
  }

  let sessionCorrect = 0;
  let sessionXp = 0;
  let attemptTime = sessionStart.getTime();

  for (const c of picks) {
    const correct = answeredCorrect(week, c.difficulty);
    const timeMs = timeSpent(c.difficulty, correct);
    const xp = correct ? (10 + c.difficulty * 5) : 2;
    sessionCorrect += correct;
    sessionXp += xp;
    totalAttempts += 1;
    totalCorrect += correct;
    totalXp += xp;

    const ts = new Date(attemptTime).toISOString().replace('T', ' ').slice(0, 19);
    const correctIdx = Math.floor(Math.random() * 4);
    const answerIdx = correct ? correctIdx : (correctIdx + 1 + Math.floor(Math.random() * 3)) % 4;
    insertAttempt.run(c.id, correct, timeMs, ts, ERICA_ID, sessionId, answerIdx, correctIdx, xp);
    attemptTime += timeMs + (2000 + Math.random() * 8000);
  }

  const sessionStartIso = sessionStart.toISOString().replace('T', ' ').slice(0, 19);
  const sessionEndIso = new Date(attemptTime).toISOString().replace('T', ' ').slice(0, 19);
  insertSession.run(sessionId, ERICA_ID, mode, sessionStartIso, sessionEndIso, qCount, sessionCorrect, sessionXp);
}

console.log(`Seeded ${totalAttempts} quiz attempts across 14 sessions for erica_demo`);
console.log(`Overall accuracy: ${((totalCorrect / totalAttempts) * 100).toFixed(1)}%`);
console.log(`Total XP: ${totalXp}`);

// Update user_xp if table exists
try {
  const xpRow = db.prepare('SELECT * FROM user_xp WHERE user_id = ?').get(ERICA_ID);
  if (xpRow) {
    db.prepare('UPDATE user_xp SET total_xp = ?, current_level = ? WHERE user_id = ?').run(totalXp, Math.floor(totalXp / 100) + 1, ERICA_ID);
  } else {
    db.prepare('INSERT INTO user_xp (user_id, total_xp, current_level) VALUES (?, ?, ?)').run(ERICA_ID, totalXp, Math.floor(totalXp / 100) + 1);
  }
  console.log(`Updated user_xp: total=${totalXp}, level=${Math.floor(totalXp / 100) + 1}`);
} catch (e) {
  console.log('user_xp update skipped:', e.message);
}

// Add some differential attempts so the differential mode chart populates
const diffCases = cases.slice(0, 8);
for (let i = 0; i < 8; i++) {
  const c = diffCases[i];
  const daysAgo = Math.floor(Math.random() * 28);
  const ts = new Date(now.getTime() - daysAgo * dayMs).toISOString().replace('T', ' ').slice(0, 19);
  const score = 0.45 + Math.random() * 0.5;
  db.prepare(`
    INSERT INTO differential_attempts (user_id, case_id, user_differentials, score, matched, missed, extra, time_spent_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ERICA_ID, c.id, JSON.stringify(['Diagnosis A', 'Diagnosis B', 'Diagnosis C']),
        score, JSON.stringify(['Correct dx']), JSON.stringify(['Missed dx']), JSON.stringify([]), 60000 + Math.random() * 90000, ts);
}

console.log(`Seeded 8 differential attempts`);

db.close();
console.log('DONE.');
