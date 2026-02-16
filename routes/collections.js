const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

module.exports = function(db) {

  // GET / - List user's collections (owned, public, or curated)
  router.get('/', requireAuth, (req, res) => {
    try {
      const userId = req.user.id;

      const collections = db.prepare(`
        SELECT c.*
        FROM collections c
        WHERE c.created_by = ? OR c.visibility = 'public' OR c.collection_type = 'curated'
        ORDER BY c.updated_at DESC
      `).all(userId);

      // Compute progress for each collection
      const collectionsWithProgress = collections.map(col => {
        const totalCases = col.case_count || 0;
        let progress = 0;

        if (totalCases > 0) {
          const completed = db.prepare(`
            SELECT COUNT(*) as count
            FROM collection_progress
            WHERE user_id = ? AND collection_id = ? AND completed = 1
          `).get(userId, col.id);
          progress = Math.round(((completed.count || 0) / totalCases) * 100);
        }

        return { ...col, progress };
      });

      res.json({ collections: collectionsWithProgress });
    } catch (err) {
      console.error('Error listing collections:', err);
      res.status(500).json({ error: 'Failed to list collections' });
    }
  });

  // GET /public - List curated + public collections (no auth required)
  router.get('/public', (req, res) => {
    try {
      const collections = db.prepare(`
        SELECT c.*
        FROM collections c
        WHERE c.visibility = 'public' OR c.collection_type = 'curated'
        ORDER BY c.updated_at DESC
      `).all();

      res.json({ collections });
    } catch (err) {
      console.error('Error listing public collections:', err);
      res.status(500).json({ error: 'Failed to list public collections' });
    }
  });

  // GET /share/:code - Get collection by share code
  router.get('/share/:code', (req, res) => {
    try {
      const collection = db.prepare(`
        SELECT * FROM collections WHERE share_code = ?
      `).get(req.params.code);

      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      const cases = db.prepare(`
        SELECT cc.display_order, cc.added_at, c.id, c.title, c.modality, c.body_part,
               c.diagnosis, c.difficulty, c.clinical_history,
               (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
        FROM collection_cases cc
        JOIN cases c ON cc.case_id = c.id
        WHERE cc.collection_id = ?
        ORDER BY cc.display_order ASC
      `).all(collection.id);

      res.json({ collection, cases });
    } catch (err) {
      console.error('Error fetching shared collection:', err);
      res.status(500).json({ error: 'Failed to fetch shared collection' });
    }
  });

  // POST /share/:code/clone - Clone a shared collection
  router.post('/share/:code/clone', requireAuth, (req, res) => {
    try {
      const userId = req.user.id;

      const source = db.prepare(`
        SELECT * FROM collections WHERE share_code = ?
      `).get(req.params.code);

      if (!source) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      const newId = uuidv4();
      const newShareCode = crypto.randomBytes(4).toString('hex');
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO collections (id, name, description, cover_image, collection_type, visibility, created_by, share_code, case_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'custom', 'private', ?, ?, ?, ?, ?)
      `).run(newId, source.name, source.description, source.cover_image, userId, newShareCode, source.case_count, now, now);

      // Copy all cases from the source collection
      const sourceCases = db.prepare(`
        SELECT case_id, display_order FROM collection_cases WHERE collection_id = ?
        ORDER BY display_order ASC
      `).all(source.id);

      const insertCase = db.prepare(`
        INSERT INTO collection_cases (collection_id, case_id, display_order, added_at)
        VALUES (?, ?, ?, ?)
      `);

      for (const sc of sourceCases) {
        insertCase.run(newId, sc.case_id, sc.display_order, now);
      }

      res.json({ id: newId, share_code: newShareCode, message: 'Collection cloned successfully' });
    } catch (err) {
      console.error('Error cloning collection:', err);
      res.status(500).json({ error: 'Failed to clone collection' });
    }
  });

  // GET /:id - Collection detail with cases and optional progress
  router.get('/:id', (req, res) => {
    try {
      const collection = db.prepare(`
        SELECT * FROM collections WHERE id = ?
      `).get(req.params.id);

      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      const cases = db.prepare(`
        SELECT cc.display_order, cc.added_at, c.id, c.title, c.modality, c.body_part,
               c.diagnosis, c.difficulty, c.clinical_history,
               (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
        FROM collection_cases cc
        JOIN cases c ON cc.case_id = c.id
        WHERE cc.collection_id = ?
        ORDER BY cc.display_order ASC
      `).all(req.params.id);

      // If user is authenticated, include per-case progress
      const userId = req.user?.id;
      let casesWithProgress = cases;

      if (userId) {
        const progressRows = db.prepare(`
          SELECT case_id, completed, score, completed_at
          FROM collection_progress
          WHERE user_id = ? AND collection_id = ?
        `).all(userId, req.params.id);

        const progressMap = {};
        for (const row of progressRows) {
          progressMap[row.case_id] = {
            completed: row.completed,
            score: row.score,
            completed_at: row.completed_at
          };
        }

        casesWithProgress = cases.map(c => ({
          ...c,
          progress: progressMap[c.id] || { completed: 0, score: null, completed_at: null }
        }));
      }

      res.json({ collection, cases: casesWithProgress });
    } catch (err) {
      console.error('Error fetching collection:', err);
      res.status(500).json({ error: 'Failed to fetch collection' });
    }
  });

  // POST / - Create a new collection
  router.post('/', requireAuth, (req, res) => {
    try {
      const { name, description, visibility } = req.body;
      const userId = req.user.id;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const id = uuidv4();
      const shareCode = crypto.randomBytes(4).toString('hex');
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO collections (id, name, description, collection_type, visibility, created_by, share_code, case_count, created_at, updated_at)
        VALUES (?, ?, ?, 'custom', ?, ?, ?, 0, ?, ?)
      `).run(id, name.trim(), description || null, visibility || 'private', userId, shareCode, now, now);

      res.json({ id, share_code: shareCode, message: 'Collection created' });
    } catch (err) {
      console.error('Error creating collection:', err);
      res.status(500).json({ error: 'Failed to create collection' });
    }
  });

  // PUT /:id - Update collection (owner only)
  router.put('/:id', requireAuth, (req, res) => {
    try {
      const { name, description, visibility } = req.body;
      const userId = req.user.id;

      const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      if (collection.created_by !== userId) {
        return res.status(403).json({ error: 'You can only update your own collections' });
      }

      db.prepare(`
        UPDATE collections
        SET name = ?, description = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name !== undefined ? name : collection.name,
        description !== undefined ? description : collection.description,
        visibility !== undefined ? visibility : collection.visibility,
        req.params.id
      );

      res.json({ message: 'Collection updated' });
    } catch (err) {
      console.error('Error updating collection:', err);
      res.status(500).json({ error: 'Failed to update collection' });
    }
  });

  // DELETE /:id - Delete collection (owner only), cascade deletes
  router.delete('/:id', requireAuth, (req, res) => {
    try {
      const userId = req.user.id;

      const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      if (collection.created_by !== userId) {
        return res.status(403).json({ error: 'You can only delete your own collections' });
      }

      // Cascade delete related records
      db.prepare('DELETE FROM collection_progress WHERE collection_id = ?').run(req.params.id);
      db.prepare('DELETE FROM collection_cases WHERE collection_id = ?').run(req.params.id);
      db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);

      res.json({ message: 'Collection deleted' });
    } catch (err) {
      console.error('Error deleting collection:', err);
      res.status(500).json({ error: 'Failed to delete collection' });
    }
  });

  // POST /:id/cases - Add a case to a collection
  router.post('/:id/cases', requireAuth, (req, res) => {
    try {
      const { case_id } = req.body;
      const userId = req.user.id;

      if (!case_id) {
        return res.status(400).json({ error: 'case_id is required' });
      }

      const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      if (collection.created_by !== userId) {
        return res.status(403).json({ error: 'You can only modify your own collections' });
      }

      // Check if case exists
      const caseData = db.prepare('SELECT id FROM cases WHERE id = ?').get(case_id);
      if (!caseData) {
        return res.status(404).json({ error: 'Case not found' });
      }

      // Check if case is already in collection
      const existing = db.prepare('SELECT * FROM collection_cases WHERE collection_id = ? AND case_id = ?')
        .get(req.params.id, case_id);
      if (existing) {
        return res.status(409).json({ error: 'Case already in collection' });
      }

      // Compute display_order as max + 1
      const maxOrder = db.prepare('SELECT MAX(display_order) as max_order FROM collection_cases WHERE collection_id = ?')
        .get(req.params.id);
      const displayOrder = (maxOrder?.max_order ?? -1) + 1;

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO collection_cases (collection_id, case_id, display_order, added_at)
        VALUES (?, ?, ?, ?)
      `).run(req.params.id, case_id, displayOrder, now);

      // Update case_count
      db.prepare('UPDATE collections SET case_count = case_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(req.params.id);

      // Set cover_image to first case's thumbnail if not set
      if (!collection.cover_image) {
        const firstImage = db.prepare(`
          SELECT filename FROM images WHERE case_id = (
            SELECT case_id FROM collection_cases WHERE collection_id = ? ORDER BY display_order ASC LIMIT 1
          ) ORDER BY sequence LIMIT 1
        `).get(req.params.id);

        if (firstImage) {
          db.prepare('UPDATE collections SET cover_image = ? WHERE id = ?')
            .run(firstImage.filename, req.params.id);
        }
      }

      res.json({ message: 'Case added to collection', display_order: displayOrder });
    } catch (err) {
      console.error('Error adding case to collection:', err);
      res.status(500).json({ error: 'Failed to add case to collection' });
    }
  });

  // DELETE /:id/cases/:caseId - Remove a case from a collection
  router.delete('/:id/cases/:caseId', requireAuth, (req, res) => {
    try {
      const userId = req.user.id;

      const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(req.params.id);
      if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      if (collection.created_by !== userId) {
        return res.status(403).json({ error: 'You can only modify your own collections' });
      }

      const result = db.prepare('DELETE FROM collection_cases WHERE collection_id = ? AND case_id = ?')
        .run(req.params.id, req.params.caseId);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Case not found in collection' });
      }

      // Update case_count
      db.prepare('UPDATE collections SET case_count = case_count - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(req.params.id);

      res.json({ message: 'Case removed from collection' });
    } catch (err) {
      console.error('Error removing case from collection:', err);
      res.status(500).json({ error: 'Failed to remove case from collection' });
    }
  });

  // POST /:id/progress - Record progress on a case within a collection
  router.post('/:id/progress', requireAuth, (req, res) => {
    try {
      const { case_id, completed, score } = req.body;
      const userId = req.user.id;

      if (!case_id) {
        return res.status(400).json({ error: 'case_id is required' });
      }

      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO collection_progress (user_id, collection_id, case_id, completed, score, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, collection_id, case_id)
        DO UPDATE SET completed = excluded.completed, score = excluded.score, completed_at = excluded.completed_at
      `).run(userId, req.params.id, case_id, completed ? 1 : 0, score ?? null, completed ? now : null);

      res.json({ message: 'Progress recorded' });
    } catch (err) {
      console.error('Error recording progress:', err);
      res.status(500).json({ error: 'Failed to record progress' });
    }
  });

  return router;
};
