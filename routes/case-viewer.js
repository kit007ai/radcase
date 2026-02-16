const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Levenshtein distance (inline, no external deps)
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// Common radiology abbreviation map
const ABBREVIATIONS = {
  'pe': 'pulmonary embolism',
  'dvt': 'deep vein thrombosis',
  'ards': 'acute respiratory distress syndrome',
  'copd': 'chronic obstructive pulmonary disease',
  'chf': 'congestive heart failure',
  'mi': 'myocardial infarction',
  'cva': 'cerebrovascular accident',
  'sah': 'subarachnoid hemorrhage',
  'sdh': 'subdural hematoma',
  'edh': 'epidural hematoma',
  'ich': 'intracerebral hemorrhage',
  'aaa': 'abdominal aortic aneurysm',
  'sbo': 'small bowel obstruction',
  'lbo': 'large bowel obstruction',
  'rll': 'right lower lobe',
  'rul': 'right upper lobe',
  'rml': 'right middle lobe',
  'lll': 'left lower lobe',
  'lul': 'left upper lobe',
  'ild': 'interstitial lung disease',
  'hcc': 'hepatocellular carcinoma',
  'rcc': 'renal cell carcinoma',
  'nsclc': 'non-small cell lung cancer',
  'sclc': 'small cell lung cancer',
  'avm': 'arteriovenous malformation',
  'avm': 'arteriovenous malformation',
  'tia': 'transient ischemic attack',
  'ms': 'multiple sclerosis',
  'tb': 'tuberculosis',
  'mri': 'magnetic resonance imaging',
  'ct': 'computed tomography',
};

// Normalize a differential string for comparison
function normalizeDifferential(str) {
  let s = str.toLowerCase().trim();
  // Expand known abbreviations
  if (ABBREVIATIONS[s]) {
    s = ABBREVIATIONS[s];
  }
  return s;
}

// Check if two differentials match
function differentialsMatch(userDiff, expectedDiff) {
  const u = normalizeDifferential(userDiff);
  const e = normalizeDifferential(expectedDiff);

  // Exact match
  if (u === e) return true;

  // Substring containment (either direction)
  if (u.includes(e) || e.includes(u)) return true;

  // Levenshtein distance <= 3
  if (levenshtein(u, e) <= 3) return true;

  return false;
}

module.exports = function(db) {

  // 1. GET /:id/study-view - Progressive reveal (no auth)
  router.get('/:id/study-view', (req, res) => {
    const caseData = db.prepare(`
      SELECT c.id, c.title, c.clinical_history, c.modality, c.body_part, c.difficulty,
             GROUP_CONCAT(DISTINCT t.name) as tags
      FROM cases c
      LEFT JOIN case_tags ct ON c.id = ct.case_id
      LEFT JOIN tags t ON ct.tag_id = t.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(req.params.id);

    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const images = db.prepare('SELECT * FROM images WHERE case_id = ? ORDER BY sequence').all(req.params.id);

    res.json({
      id: caseData.id,
      title: caseData.title,
      clinical_history: caseData.clinical_history,
      modality: caseData.modality,
      body_part: caseData.body_part,
      difficulty: caseData.difficulty,
      images,
      tags: caseData.tags ? caseData.tags.split(',') : [],
    });
  });

  // 2. GET /:id/reference-view - Full case data (no auth)
  router.get('/:id/reference-view', (req, res) => {
    const { trainee_level } = req.query;

    const caseData = db.prepare(`
      SELECT c.*, GROUP_CONCAT(DISTINCT t.name) as tags
      FROM cases c
      LEFT JOIN case_tags ct ON c.id = ct.case_id
      LEFT JOIN tags t ON ct.tag_id = t.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(req.params.id);

    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const images = db.prepare('SELECT * FROM images WHERE case_id = ? ORDER BY sequence').all(req.params.id);

    const keyFindings = db.prepare(
      'SELECT * FROM case_key_findings WHERE case_id = ? ORDER BY display_order'
    ).all(req.params.id);

    // Parse differentials from JSON
    let differentials = null;
    if (caseData.differentials) {
      try {
        differentials = JSON.parse(caseData.differentials);
      } catch (e) {
        differentials = caseData.differentials;
      }
    }

    // Build response with standard fields
    const result = {
      id: caseData.id,
      title: caseData.title,
      clinical_history: caseData.clinical_history,
      modality: caseData.modality,
      body_part: caseData.body_part,
      difficulty: caseData.difficulty,
      diagnosis: caseData.diagnosis,
      findings: caseData.findings,
      teaching_points: caseData.teaching_points,
      category: caseData.category,
      created_at: caseData.created_at,
      updated_at: caseData.updated_at,
      images,
      tags: caseData.tags ? caseData.tags.split(',') : [],
      differentials,
      key_findings: keyFindings,
    };

    // Adapt content based on trainee_level
    if (trainee_level === 'student') {
      result.student_notes = caseData.student_notes;
    } else if (trainee_level === 'fellow' || trainee_level === 'attending') {
      result.fellow_notes = caseData.fellow_notes;
    }

    res.json(result);
  });

  // 3. POST /:id/reveal - Progressive reveal (no auth)
  router.post('/:id/reveal', (req, res) => {
    const { step } = req.body;
    const validSteps = ['diagnosis', 'findings', 'teaching_points', 'key_findings'];

    if (!step || !validSteps.includes(step)) {
      return res.status(400).json({ error: `Invalid step. Must be one of: ${validSteps.join(', ')}` });
    }

    if (step === 'key_findings') {
      const keyFindings = db.prepare(
        'SELECT * FROM case_key_findings WHERE case_id = ? ORDER BY display_order'
      ).all(req.params.id);

      return res.json({ key_findings: keyFindings });
    }

    const caseData = db.prepare(`SELECT ${step} FROM cases WHERE id = ?`).get(req.params.id);

    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json({ [step]: caseData[step] });
  });

  // 4. POST /:id/differential-attempt - Score differential attempt (requireAuth)
  router.post('/:id/differential-attempt', requireAuth, (req, res) => {
    const { differentials: userDifferentials, time_spent_ms } = req.body;
    const userId = req.user.id;
    const caseId = req.params.id;

    if (!userDifferentials || !Array.isArray(userDifferentials) || userDifferentials.length === 0) {
      return res.status(400).json({ error: 'differentials must be a non-empty array of strings' });
    }

    const caseData = db.prepare('SELECT differentials FROM cases WHERE id = ?').get(caseId);
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (!caseData.differentials) {
      return res.status(400).json({ error: 'This case has no differentials defined' });
    }

    let expectedDiffs;
    try {
      expectedDiffs = JSON.parse(caseData.differentials);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse case differentials' });
    }

    // expectedDiffs can be an array of strings or an object with { list: [...], most_likely: '...' }
    let expectedList = [];
    let mostLikely = null;

    if (Array.isArray(expectedDiffs)) {
      expectedList = expectedDiffs;
      mostLikely = expectedDiffs[0] || null;
    } else if (expectedDiffs && typeof expectedDiffs === 'object') {
      expectedList = expectedDiffs.list || expectedDiffs.differentials || [];
      mostLikely = expectedDiffs.most_likely || expectedList[0] || null;
    }

    // Match user differentials against expected
    const matched = [];
    const matchedExpected = new Set();

    for (const userDiff of userDifferentials) {
      for (let i = 0; i < expectedList.length; i++) {
        if (matchedExpected.has(i)) continue;
        if (differentialsMatch(userDiff, expectedList[i])) {
          matched.push(expectedList[i]);
          matchedExpected.add(i);
          break;
        }
      }
    }

    const missed = expectedList.filter((_, i) => !matchedExpected.has(i));
    const extra = userDifferentials.filter(ud => {
      return !expectedList.some((ed, i) => matchedExpected.has(i) && differentialsMatch(ud, ed));
    });

    // Calculate score
    let score = expectedList.length > 0 ? matched.length / expectedList.length : 0;

    // Bonus if first user differential matches the most_likely one
    if (mostLikely && userDifferentials.length > 0 && differentialsMatch(userDifferentials[0], mostLikely)) {
      score = Math.min(1.0, score + 0.1);
    }

    // Round score to 2 decimal places
    score = Math.round(score * 100) / 100;

    // Calculate and award XP
    const xpEarned = Math.round(score * 20);

    // Store the attempt
    db.prepare(`
      INSERT INTO differential_attempts (user_id, case_id, user_differentials, score, matched, missed, extra, time_spent_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      caseId,
      JSON.stringify(userDifferentials),
      score,
      JSON.stringify(matched),
      JSON.stringify(missed),
      JSON.stringify(extra),
      time_spent_ms || 0
    );

    // Award XP
    if (xpEarned > 0) {
      // Ensure user_xp row exists
      db.prepare('INSERT OR IGNORE INTO user_xp (user_id) VALUES (?)').run(userId);

      // Add XP
      db.prepare('UPDATE user_xp SET total_xp = total_xp + ? WHERE user_id = ?').run(xpEarned, userId);

      // Log transaction
      db.prepare(`
        INSERT INTO xp_transactions (user_id, amount, reason, session_id, case_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, xpEarned, 'differential_attempt', null, caseId);

      // Update level
      const xpRow = db.prepare('SELECT total_xp FROM user_xp WHERE user_id = ?').get(userId);
      const newLevel = levelFromXp(xpRow.total_xp);
      db.prepare('UPDATE user_xp SET level = ? WHERE user_id = ?').run(newLevel, userId);
    }

    res.json({
      score,
      matched,
      missed,
      extra,
      xp_earned: xpEarned,
    });
  });

  // 5. GET /:id/key-findings - Get all key findings for a case (no auth)
  router.get('/:id/key-findings', (req, res) => {
    const keyFindings = db.prepare(
      'SELECT * FROM case_key_findings WHERE case_id = ? ORDER BY display_order'
    ).all(req.params.id);

    res.json({ key_findings: keyFindings });
  });

  // 6. POST /:id/key-findings - Add a key finding (requireAuth, fellow/attending only)
  router.post('/:id/key-findings', requireAuth, (req, res) => {
    const userId = req.user.id;

    // Check trainee_level from req.user or users table
    let traineeLevel = req.user.trainee_level;
    if (!traineeLevel) {
      const user = db.prepare('SELECT trainee_level FROM users WHERE id = ?').get(userId);
      traineeLevel = user?.trainee_level;
    }

    if (traineeLevel !== 'fellow' && traineeLevel !== 'attending') {
      return res.status(403).json({ error: 'Only fellows and attendings can add key findings' });
    }

    const { image_id, finding_type, region_data, label, description, display_order } = req.body;

    if (!image_id || !label || !region_data) {
      return res.status(400).json({ error: 'image_id, label, and region_data are required' });
    }

    const result = db.prepare(`
      INSERT INTO case_key_findings (case_id, image_id, finding_type, region_data, label, description, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      image_id,
      finding_type || 'arrow',
      typeof region_data === 'string' ? region_data : JSON.stringify(region_data),
      label,
      description || null,
      display_order || 0
    );

    res.json({
      id: result.lastInsertRowid,
      message: 'Key finding added',
    });
  });

  // 7. DELETE /:id/key-findings/:findingId - Delete a key finding (requireAuth, fellow/attending only)
  router.delete('/:id/key-findings/:findingId', requireAuth, (req, res) => {
    const userId = req.user.id;

    // Check trainee_level from req.user or users table
    let traineeLevel = req.user.trainee_level;
    if (!traineeLevel) {
      const user = db.prepare('SELECT trainee_level FROM users WHERE id = ?').get(userId);
      traineeLevel = user?.trainee_level;
    }

    if (traineeLevel !== 'fellow' && traineeLevel !== 'attending') {
      return res.status(403).json({ error: 'Only fellows and attendings can delete key findings' });
    }

    const finding = db.prepare(
      'SELECT * FROM case_key_findings WHERE id = ? AND case_id = ?'
    ).get(req.params.findingId, req.params.id);

    if (!finding) {
      return res.status(404).json({ error: 'Key finding not found' });
    }

    db.prepare('DELETE FROM case_key_findings WHERE id = ? AND case_id = ?')
      .run(req.params.findingId, req.params.id);

    res.json({ message: 'Key finding deleted' });
  });

  return router;
};

// Inline level calculation (mirrors gamification.js)
function levelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

function xpForLevel(n) {
  return Math.floor(50 * n * (n - 1));
}
