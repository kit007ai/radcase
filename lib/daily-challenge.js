// Daily challenge case selection + study plan template seeding

function getOrCreateDailyChallenge(db) {
  const today = new Date().toISOString().split('T')[0];

  const existing = db.prepare('SELECT * FROM daily_challenges WHERE challenge_date = ?').get(today);
  if (existing) {
    return { date: existing.challenge_date, caseIds: JSON.parse(existing.case_ids) };
  }

  // Select 5 cases: 1 easy, 2 medium, 1 hard, 1 expert
  const picks = [];
  const difficulties = [
    { difficulty: 1, count: 1 },
    { difficulty: 2, count: 2 },
    { difficulty: 3, count: 1 },
    { difficulty: 4, count: 1 },
  ];

  for (const { difficulty, count } of difficulties) {
    const cases = db.prepare(`
      SELECT id FROM cases
      WHERE difficulty = ? AND diagnosis IS NOT NULL AND diagnosis != ''
      ORDER BY RANDOM() LIMIT ?
    `).all(difficulty, count);
    picks.push(...cases.map(c => c.id));
  }

  // If we didn't get enough, fill with random
  if (picks.length < 5) {
    const fill = db.prepare(`
      SELECT id FROM cases
      WHERE id NOT IN (${picks.map(() => '?').join(',') || "''"})
        AND diagnosis IS NOT NULL AND diagnosis != ''
      ORDER BY RANDOM() LIMIT ?
    `).all(...picks, 5 - picks.length);
    picks.push(...fill.map(c => c.id));
  }

  if (picks.length === 0) return null;

  db.prepare('INSERT INTO daily_challenges (challenge_date, case_ids) VALUES (?, ?)').run(today, JSON.stringify(picks));
  return { date: today, caseIds: picks };
}

const STUDY_PLAN_TEMPLATES = [
  {
    id: 'abr-chest',
    name: 'ABR Core Prep - Chest',
    description: 'Comprehensive chest radiology review for ABR Core Exam preparation',
    category: 'board-prep',
    milestones: JSON.stringify([
      { name: 'Basic Chest X-Ray', criteria: { body_part: 'Chest', modality: 'X-Ray', difficulty: [1, 2] }, caseCount: 20, requiredAccuracy: 70 },
      { name: 'Chest CT Fundamentals', criteria: { body_part: 'Chest', modality: 'CT', difficulty: [2, 3] }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Advanced Chest Pathology', criteria: { body_part: 'Chest', difficulty: [3, 4] }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Mixed Chest Review', criteria: { body_part: 'Chest' }, caseCount: 10, requiredAccuracy: 75 },
    ]),
  },
  {
    id: 'abr-neuro',
    name: 'ABR Core Prep - Neuro',
    description: 'Neuroradiology review for ABR Core Exam preparation',
    category: 'board-prep',
    milestones: JSON.stringify([
      { name: 'Basic Brain Imaging', criteria: { body_part: 'Head', difficulty: [1, 2] }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Advanced Neuro CT/MRI', criteria: { body_part: 'Head', difficulty: [2, 3] }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Spine Fundamentals', criteria: { body_part: 'Spine', difficulty: [1, 2, 3] }, caseCount: 10, requiredAccuracy: 70 },
      { name: 'Mixed Neuro Review', criteria: { body_part: ['Head', 'Spine'] }, caseCount: 10, requiredAccuracy: 75 },
    ]),
  },
  {
    id: 'abr-abdomen',
    name: 'ABR Core Prep - Abdomen',
    description: 'Abdominal radiology review for ABR Core Exam preparation',
    category: 'board-prep',
    milestones: JSON.stringify([
      { name: 'Abdominal X-Ray Basics', criteria: { body_part: 'Abdomen', modality: 'X-Ray', difficulty: [1, 2] }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Abdominal CT', criteria: { body_part: 'Abdomen', modality: 'CT', difficulty: [2, 3] }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Pelvic Imaging', criteria: { body_part: 'Pelvis' }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Mixed Abdominal Review', criteria: { body_part: ['Abdomen', 'Pelvis'] }, caseCount: 10, requiredAccuracy: 75 },
    ]),
  },
  {
    id: 'emergency-rad',
    name: 'Emergency Radiology Essentials',
    description: 'High-yield cases commonly seen in the emergency department',
    category: 'specialty',
    milestones: JSON.stringify([
      { name: 'Trauma Imaging', criteria: { difficulty: [2, 3] }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Acute Abdomen', criteria: { body_part: 'Abdomen', difficulty: [2, 3] }, caseCount: 15, requiredAccuracy: 70 },
      { name: 'Neuro Emergencies', criteria: { body_part: 'Head', difficulty: [2, 3, 4] }, caseCount: 10, requiredAccuracy: 70 },
    ]),
  },
  {
    id: '30-day-review',
    name: '30-Day Full Review',
    description: 'Comprehensive review of all cases over 30 days',
    category: 'general',
    milestones: JSON.stringify([
      { name: 'Week 1: Easy Cases', criteria: { difficulty: [1, 2] }, caseCount: 30, requiredAccuracy: 60 },
      { name: 'Week 2: Medium Cases', criteria: { difficulty: [2, 3] }, caseCount: 30, requiredAccuracy: 65 },
      { name: 'Week 3: Hard Cases', criteria: { difficulty: [3, 4] }, caseCount: 25, requiredAccuracy: 70 },
      { name: 'Week 4: Expert Cases', criteria: { difficulty: [4, 5] }, caseCount: 20, requiredAccuracy: 70 },
      { name: 'Final Review: Weak Areas', criteria: {}, caseCount: 20, requiredAccuracy: 75 },
      { name: 'Comprehensive Assessment', criteria: {}, caseCount: 15, requiredAccuracy: 80 },
    ]),
  },
];

function seedStudyPlanTemplates(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO study_plan_templates (id, name, description, category, milestones)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const t of STUDY_PLAN_TEMPLATES) {
    insert.run(t.id, t.name, t.description, t.category, t.milestones);
  }
}

module.exports = { getOrCreateDailyChallenge, seedStudyPlanTemplates, STUDY_PLAN_TEMPLATES };
