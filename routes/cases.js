const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { upload } = require('../middleware/upload');
const { cacheMiddleware } = require('../lib/cache');

const router = express.Router();

module.exports = function(db, cache, cacheInvalidator) {
  // Cache middleware for read-heavy endpoints
  const apiCache10m = cacheMiddleware(cache, { ttl: 10 * 60 * 1000 });
  const apiCache1h = cacheMiddleware(cache, { ttl: 60 * 60 * 1000 });

  const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
  const THUMB_DIR = path.join(__dirname, '..', 'thumbnails');

  // Get all cases with filters
  router.get('/', apiCache10m, (req, res) => {
    const { modality, body_part, difficulty, tag, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT c.*,
             GROUP_CONCAT(DISTINCT t.name) as tags,
             COUNT(DISTINCT i.id) as image_count,
             (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
      FROM cases c
      LEFT JOIN case_tags ct ON c.id = ct.case_id
      LEFT JOIN tags t ON ct.tag_id = t.id
      LEFT JOIN images i ON c.id = i.case_id
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
    if (tag) {
      conditions.push('t.name = ?');
      params.push(tag);
    }
    if (search) {
      conditions.push('(c.title LIKE ? OR c.diagnosis LIKE ? OR c.clinical_history LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const cases = db.prepare(sql).all(...params);

    // Get total count
    let countSql = 'SELECT COUNT(DISTINCT c.id) as total FROM cases c';
    if (tag) {
      countSql += ' LEFT JOIN case_tags ct ON c.id = ct.case_id LEFT JOIN tags t ON ct.tag_id = t.id';
    }
    if (conditions.length > 0) {
      countSql += ' WHERE ' + conditions.join(' AND ');
    }
    const countParams = params.slice(0, -2);
    const { total } = db.prepare(countSql).get(...countParams) || { total: 0 };

    res.json({ cases, total, limit: parseInt(limit), offset: parseInt(offset) });
  });

  // Micro-learning case selection (must be before /:id)
  router.get('/micro-learning', (req, res) => {
    const { specialty, difficulty, timeAvailable, lastReviewed, limit = 10 } = req.query;
    const userId = req.user?.id;
    const caseLimit = parseInt(limit);

    const poolSize = Math.max(caseLimit * 5, 50);

    let sql = `
      SELECT c.*,
             GROUP_CONCAT(DISTINCT t.name) as tags,
             (SELECT filename FROM images WHERE case_id = c.id ORDER BY sequence LIMIT 1) as thumbnail
      FROM cases c
      LEFT JOIN case_tags ct ON c.id = ct.case_id
      LEFT JOIN tags t ON ct.tag_id = t.id
    `;

    const conditions = [];
    const params = [];

    if (specialty && specialty !== 'undefined') {
      conditions.push('(c.body_part = ? OR c.modality = ?)');
      params.push(specialty, specialty);
    }
    if (difficulty && difficulty !== 'undefined') {
      conditions.push('c.difficulty = ?');
      params.push(parseInt(difficulty) || 2);
    }
    conditions.push("c.diagnosis IS NOT NULL AND c.diagnosis != ''");

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' GROUP BY c.id LIMIT ?';
    params.push(poolSize);

    try {
      const cases = db.prepare(sql).all(...params);

      // Build performance and review data for weighted selection
      let performanceMap = {};
      let reviewMap = {};

      if (userId) {
        const quizStats = db.prepare(`
          SELECT case_id,
                 COUNT(*) as attempts,
                 SUM(correct) as correct_count
          FROM quiz_attempts
          WHERE user_id = ?
          GROUP BY case_id
        `).all(userId);

        for (const stat of quizStats) {
          performanceMap[stat.case_id] = {
            attempts: stat.attempts,
            accuracy: stat.correct_count / stat.attempts
          };
        }

        const progressRows = db.prepare(`
          SELECT case_id, last_reviewed
          FROM user_case_progress
          WHERE user_id = ?
        `).all(userId);

        for (const row of progressRows) {
          reviewMap[row.case_id] = row.last_reviewed;
        }
      }

      const now = Date.now();

      // Calculate weight for each case
      const weighted = cases.map(c => {
        let weight = 1.0;

        const perf = performanceMap[c.id];
        if (perf) {
          weight *= 1.0 + (1.0 - perf.accuracy) * 2.0;
        } else {
          weight *= 1.5;
        }

        const lastReview = reviewMap[c.id];
        if (lastReview) {
          const daysSinceReview = (now - new Date(lastReview).getTime()) / (1000 * 60 * 60 * 24);
          weight *= Math.min(1.0 + daysSinceReview * 0.3, 5.0);
        } else {
          weight *= 2.0;
        }

        const targetDiff = parseInt(difficulty) || 2;
        const diffDelta = Math.abs((c.difficulty || 2) - targetDiff);
        weight *= 1.0 / (1.0 + diffDelta * 0.3);

        return { caseData: c, weight };
      });

      // Weighted random selection
      const selected = [];
      const pool = [...weighted];

      while (selected.length < caseLimit && pool.length > 0) {
        const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
        let rand = Math.random() * totalWeight;

        for (let i = 0; i < pool.length; i++) {
          rand -= pool[i].weight;
          if (rand <= 0) {
            selected.push(pool[i].caseData);
            pool.splice(i, 1);
            break;
          }
        }
      }

      const microCases = selected.map(c => ({
        id: c.id,
        title: c.title,
        imageUrl: c.thumbnail ? `/thumbnails/${c.thumbnail}` : '',
        question: `What is the diagnosis for this ${c.modality || 'imaging'} study?`,
        options: generateOptions(c, selected),
        correctAnswer: 0,
        explanation: c.teaching_points || c.findings || '',
        difficulty: c.difficulty,
        specialty: c.body_part || c.modality || 'General',
        clinical_history: c.clinical_history
      }));

      microCases.forEach(mc => {
        const correctOption = mc.options[0];
        for (let i = mc.options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [mc.options[i], mc.options[j]] = [mc.options[j], mc.options[i]];
        }
        mc.correctAnswer = mc.options.indexOf(correctOption);
      });

      res.json({ cases: microCases });
    } catch (err) {
      console.error('Micro-learning error:', err);
      res.status(500).json({ error: 'Failed to load micro-learning cases', cases: [] });
    }
  });

  // Get single case with all details
  router.get('/:id', apiCache1h, (req, res) => {
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

    res.json({ ...caseData, images });
  });

  // Create new case
  router.post('/', (req, res) => {
    const { title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings, tags } = req.body;
    const id = uuidv4();

    db.prepare(`
      INSERT INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, modality, body_part, diagnosis, difficulty || 2, clinical_history, teaching_points, findings);

    // Handle tags
    if (tags && tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
      const linkTag = db.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)');

      for (const tagName of tags) {
        insertTag.run(tagName.trim().toLowerCase());
        const tag = getTagId.get(tagName.trim().toLowerCase());
        if (tag) linkTag.run(id, tag.id);
      }
    }

    cacheInvalidator.invalidateAllCases().catch(() => {});
    res.json({ id, message: 'Case created' });
  });

  // Update case
  router.put('/:id', (req, res) => {
    const { title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings, tags } = req.body;

    db.prepare(`
      UPDATE cases
      SET title = ?, modality = ?, body_part = ?, diagnosis = ?, difficulty = ?,
          clinical_history = ?, teaching_points = ?, findings = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings, req.params.id);

    // Update tags
    db.prepare('DELETE FROM case_tags WHERE case_id = ?').run(req.params.id);
    if (tags && tags.length > 0) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
      const linkTag = db.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)');

      for (const tagName of tags) {
        insertTag.run(tagName.trim().toLowerCase());
        const tag = getTagId.get(tagName.trim().toLowerCase());
        if (tag) linkTag.run(req.params.id, tag.id);
      }
    }

    res.json({ message: 'Case updated' });
  });

  // Delete case
  router.delete('/:id', (req, res) => {
    const images = db.prepare('SELECT filename FROM images WHERE case_id = ?').all(req.params.id);
    for (const img of images) {
      fs.unlink(path.join(UPLOAD_DIR, img.filename), () => {});
      fs.unlink(path.join(THUMB_DIR, img.filename), () => {});
    }

    db.prepare('DELETE FROM cases WHERE id = ?').run(req.params.id);
    res.json({ message: 'Case deleted' });
  });

  // Upload images for a case
  router.post('/:id/images', upload.array('images', 20), async (req, res) => {
    const caseId = req.params.id;
    const insertImage = db.prepare(`
      INSERT INTO images (id, case_id, filename, original_name, sequence)
      VALUES (?, ?, ?, ?, ?)
    `);

    const currentMax = db.prepare('SELECT MAX(sequence) as maxSeq FROM images WHERE case_id = ?').get(caseId);
    let seq = (currentMax?.maxSeq || 0) + 1;

    const uploaded = [];
    for (const file of req.files) {
      const imageId = uuidv4();

      // Create thumbnail
      try {
        await sharp(file.path)
          .resize(400, 400, { fit: 'inside' })
          .toFile(path.join(THUMB_DIR, file.filename));
        // Also generate WebP version
        const webpName = file.filename.replace(/\.[^.]+$/, '.webp');
        await sharp(file.path)
          .resize(400, 400, { fit: 'inside' })
          .webp({ quality: 80 })
          .toFile(path.join(THUMB_DIR, webpName));
      } catch (e) {
        fs.copyFileSync(file.path, path.join(THUMB_DIR, file.filename));
      }

      insertImage.run(imageId, caseId, file.filename, file.originalname, seq++);
      uploaded.push({ id: imageId, filename: file.filename });
    }

    res.json({ uploaded });
  });

  // Update image annotations
  router.put('/:caseId/images/:id/annotations', (req, res) => {
    const { annotations } = req.body;
    db.prepare('UPDATE images SET annotations = ? WHERE id = ?').run(JSON.stringify(annotations), req.params.id);
    res.json({ message: 'Annotations saved' });
  });

  // Export single case
  router.get('/:id/export', (req, res) => {
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

    const images = db.prepare('SELECT * FROM images WHERE case_id = ?').all(caseData.id);

    const exportData = {
      ...caseData,
      tags: caseData.tags ? caseData.tags.split(',') : [],
      images: images.map(img => ({
        ...img,
        data: fs.existsSync(path.join(UPLOAD_DIR, img.filename))
          ? fs.readFileSync(path.join(UPLOAD_DIR, img.filename), 'base64')
          : null
      }))
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="case-${caseData.id}.json"`);
    res.json({ version: 1, case: exportData });
  });

  // Get DICOM series for a case (mounted under /api/cases/:id/dicom)
  router.get('/:id/dicom', (req, res) => {
    const series = db.prepare(`
      SELECT * FROM dicom_series WHERE case_id = ? ORDER BY created_at
    `).all(req.params.id);

    res.json({ series });
  });

  // Upload DICOM series for a case
  const { dicomUpload } = require('../middleware/upload');
  router.post('/:id/dicom', dicomUpload.array('files', 1000), async (req, res) => {
    const { parseDicomFile } = require('./dicom');
    console.log(`DICOM upload: ${req.files?.length} files received, seriesId=${req.dicomSeriesId}`);
    if (req.files) {
      req.files.forEach((f, i) => console.log(`  file[${i}]: ${f.originalname} -> ${f.path}`));
    }
    const caseId = req.params.id;
    const { v4: uuidv4 } = require('uuid');
    const seriesId = req.dicomSeriesId || uuidv4();
    const DICOM_DIR = path.join(__dirname, '..', 'dicom');
    const seriesDir = path.join(DICOM_DIR, seriesId);

    fs.mkdirSync(seriesDir, { recursive: true });

    let metadata = null;
    const dicomFiles = [];

    if (req.files && req.files.length > 0) {
      metadata = parseDicomFile(req.files[0].path);

      for (const file of req.files) {
        const fileMetadata = parseDicomFile(file.path);
        dicomFiles.push({
          filename: file.filename,
          instanceNumber: fileMetadata?.instanceNumber || 0,
          sliceLocation: fileMetadata?.sliceLocation
        });
      }

      dicomFiles.sort((a, b) => {
        if (a.sliceLocation !== null && b.sliceLocation !== null) {
          return a.sliceLocation - b.sliceLocation;
        }
        return a.instanceNumber - b.instanceNumber;
      });
    }

    db.prepare(`
      INSERT INTO dicom_series (
        id, case_id, series_uid, series_description, modality, num_images,
        folder_name, patient_name, study_description, window_center, window_width
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      seriesId,
      caseId,
      metadata?.seriesInstanceUID || null,
      metadata?.seriesDescription || 'Unnamed Series',
      metadata?.modality || 'Unknown',
      dicomFiles.length,
      seriesId,
      metadata?.patientName || null,
      metadata?.studyDescription || null,
      metadata?.windowCenter || null,
      metadata?.windowWidth || null
    );

    res.json({
      seriesId,
      numImages: dicomFiles.length,
      metadata,
      files: dicomFiles
    });
  });

  return router;
};

function generateOptions(targetCase, allCases) {
  const correctDiagnosis = targetCase.diagnosis;
  const otherDiagnoses = allCases
    .filter(c => c.id !== targetCase.id && c.diagnosis)
    .map(c => c.diagnosis);

  const wrongAnswers = [];
  const shuffled = [...otherDiagnoses].sort(() => Math.random() - 0.5);
  for (const d of shuffled) {
    if (!wrongAnswers.includes(d) && d !== correctDiagnosis) {
      wrongAnswers.push(d);
      if (wrongAnswers.length >= 3) break;
    }
  }

  const fallbacks = ['Normal study', 'Artifact', 'Incidental finding'];
  while (wrongAnswers.length < 3) {
    const f = fallbacks[wrongAnswers.length];
    if (f && !wrongAnswers.includes(f) && f !== correctDiagnosis) {
      wrongAnswers.push(f);
    } else break;
  }

  return [correctDiagnosis, ...wrongAnswers];
}
