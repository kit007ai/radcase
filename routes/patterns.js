const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = function(db) {
  // GET /cases/:caseId/related - Get related cases and pattern groups for a case
  router.get('/cases/:caseId/related', (req, res) => {
    const { caseId } = req.params;

    // Find all related cases (where this case is either side of the relationship)
    const relatedRows = db.prepare(`
      SELECT rc.id, rc.relationship_type, rc.description,
             rc.case_id_a, rc.case_id_b,
             c.id as related_id, c.title, c.modality, c.body_part, c.difficulty,
             (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
      FROM related_cases rc
      JOIN cases c ON c.id = CASE WHEN rc.case_id_a = ? THEN rc.case_id_b ELSE rc.case_id_a END
      WHERE rc.case_id_a = ? OR rc.case_id_b = ?
    `).all(caseId, caseId, caseId);

    const related = relatedRows.map(row => ({
      id: row.id,
      case_id: row.related_id,
      title: row.title,
      modality: row.modality,
      body_part: row.body_part,
      difficulty: row.difficulty,
      thumbnail: row.thumbnail,
      relationship_type: row.relationship_type,
      description: row.description
    }));

    // Find pattern groups that contain this case
    const patternGroups = db.prepare(`
      SELECT pg.id, pg.name, pg.description, pg.pattern_type, pg.created_at
      FROM pattern_groups pg
      JOIN pattern_group_cases pgc ON pg.id = pgc.group_id
      WHERE pgc.case_id = ?
    `).all(caseId);

    res.json({ related, patternGroups });
  });

  // POST /cases/:caseId/related - Link two cases as related
  router.post('/cases/:caseId/related', requireAuth, (req, res) => {
    const { caseId } = req.params;
    const { related_case_id, relationship_type, description } = req.body;

    if (!related_case_id) {
      return res.status(400).json({ error: 'related_case_id is required' });
    }

    const validTypes = ['similar', 'variant', 'compare_normal', 'differential'];
    const relType = validTypes.includes(relationship_type) ? relationship_type : 'similar';

    // Verify both cases exist
    const caseA = db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId);
    const caseB = db.prepare('SELECT id FROM cases WHERE id = ?').get(related_case_id);

    if (!caseA) {
      return res.status(404).json({ error: 'Case not found' });
    }
    if (!caseB) {
      return res.status(404).json({ error: 'Related case not found' });
    }

    if (caseId === related_case_id) {
      return res.status(400).json({ error: 'Cannot relate a case to itself' });
    }

    // Normalize ordering so case_id_a < case_id_b to avoid duplicates in both directions
    const [idA, idB] = caseId < related_case_id ? [caseId, related_case_id] : [related_case_id, caseId];

    try {
      db.prepare(`
        INSERT INTO related_cases (case_id_a, case_id_b, relationship_type, description)
        VALUES (?, ?, ?, ?)
      `).run(idA, idB, relType, description || null);

      res.json({ message: 'Cases linked', case_id_a: idA, case_id_b: idB, relationship_type: relType });
    } catch (e) {
      if (e.message.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: 'This relationship already exists' });
      }
      throw e;
    }
  });

  // GET /groups - List all pattern groups with case counts
  router.get('/groups', (req, res) => {
    const groups = db.prepare(`
      SELECT pg.*, COUNT(pgc.case_id) as case_count
      FROM pattern_groups pg
      LEFT JOIN pattern_group_cases pgc ON pg.id = pgc.group_id
      GROUP BY pg.id
      ORDER BY pg.created_at DESC
    `).all();

    res.json(groups);
  });

  // GET /groups/:id - Get a pattern group with its cases
  router.get('/groups/:id', (req, res) => {
    const group = db.prepare('SELECT * FROM pattern_groups WHERE id = ?').get(req.params.id);

    if (!group) {
      return res.status(404).json({ error: 'Pattern group not found' });
    }

    const cases = db.prepare(`
      SELECT c.id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty,
             pgc.display_order,
             (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
      FROM pattern_group_cases pgc
      JOIN cases c ON pgc.case_id = c.id
      WHERE pgc.group_id = ?
      ORDER BY pgc.display_order ASC
    `).all(req.params.id);

    res.json({ ...group, cases });
  });

  // POST /groups - Create a pattern group
  router.post('/groups', requireAuth, (req, res) => {
    const { name, description, pattern_type, case_ids } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const id = uuidv4();
    const pType = pattern_type || 'diagnosis';

    db.prepare(`
      INSERT INTO pattern_groups (id, name, description, pattern_type, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, description || null, pType, req.user.id);

    // Link cases if provided
    if (Array.isArray(case_ids) && case_ids.length > 0) {
      const insertCase = db.prepare(
        'INSERT OR IGNORE INTO pattern_group_cases (group_id, case_id, display_order) VALUES (?, ?, ?)'
      );
      const linkMany = db.transaction((ids) => {
        ids.forEach((caseId, index) => {
          insertCase.run(id, caseId, index);
        });
      });
      linkMany(case_ids);
    }

    res.json({ id, name, description: description || null, pattern_type: pType });
  });

  // POST /groups/auto-generate - Auto-group cases by shared diagnosis and anatomy
  router.post('/groups/auto-generate', requireAuth, (req, res) => {
    let created = 0;
    const groups = [];

    // --- Group by shared diagnosis (2+ cases) ---
    const diagnosisGroups = db.prepare(`
      SELECT diagnosis, COUNT(*) as cnt
      FROM cases
      WHERE diagnosis IS NOT NULL AND diagnosis != ''
      GROUP BY diagnosis
      HAVING COUNT(*) >= 2
    `).all();

    const insertGroup = db.prepare(`
      INSERT INTO pattern_groups (id, name, description, pattern_type, created_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertGroupCase = db.prepare(
      'INSERT OR IGNORE INTO pattern_group_cases (group_id, case_id, display_order) VALUES (?, ?, ?)'
    );

    const autoGenerate = db.transaction(() => {
      for (const dg of diagnosisGroups) {
        // Check if a group with this name already exists
        const existing = db.prepare(
          "SELECT id FROM pattern_groups WHERE name = ? AND pattern_type = 'diagnosis'"
        ).get(dg.diagnosis);

        if (existing) continue;

        const groupId = uuidv4();
        insertGroup.run(
          groupId,
          dg.diagnosis,
          `Auto-generated group for diagnosis: ${dg.diagnosis}`,
          'diagnosis',
          req.user.id
        );

        const matchingCases = db.prepare(
          'SELECT id FROM cases WHERE diagnosis = ? ORDER BY difficulty ASC'
        ).all(dg.diagnosis);

        matchingCases.forEach((c, index) => {
          insertGroupCase.run(groupId, c.id, index);
        });

        created++;
        groups.push({ id: groupId, name: dg.diagnosis, pattern_type: 'diagnosis', case_count: matchingCases.length });
      }

      // --- Group by body_part + modality combos (3+ cases) ---
      const anatomyGroups = db.prepare(`
        SELECT body_part, modality, COUNT(*) as cnt
        FROM cases
        WHERE body_part IS NOT NULL AND body_part != ''
          AND modality IS NOT NULL AND modality != ''
        GROUP BY body_part, modality
        HAVING COUNT(*) >= 3
      `).all();

      for (const ag of anatomyGroups) {
        const groupName = `${ag.body_part} - ${ag.modality}`;

        const existing = db.prepare(
          "SELECT id FROM pattern_groups WHERE name = ? AND pattern_type = 'anatomy'"
        ).get(groupName);

        if (existing) continue;

        const groupId = uuidv4();
        insertGroup.run(
          groupId,
          groupName,
          `Auto-generated group for ${ag.modality} studies of ${ag.body_part}`,
          'anatomy',
          req.user.id
        );

        const matchingCases = db.prepare(
          'SELECT id FROM cases WHERE body_part = ? AND modality = ? ORDER BY difficulty ASC'
        ).all(ag.body_part, ag.modality);

        matchingCases.forEach((c, index) => {
          insertGroupCase.run(groupId, c.id, index);
        });

        created++;
        groups.push({ id: groupId, name: groupName, pattern_type: 'anatomy', case_count: matchingCases.length });
      }
    });

    autoGenerate();

    res.json({ created, groups });
  });

  return router;
};
