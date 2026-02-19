const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

module.exports = function(db, monitor) {
  const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
  const THUMB_DIR = path.join(__dirname, '..', 'thumbnails');

  // Performance monitoring endpoints
  router.get('/metrics', requireAdmin, (req, res) => {
    res.json(monitor.getMetrics());
  });

  router.get('/health', requireAdmin, (req, res) => {
    const health = monitor.getHealth();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  });

  // Get all users (for admin)
  router.get('/users', requireAdmin, (req, res) => {
    const users = db.prepare(`
      SELECT id, username, display_name, role, created_at, last_login,
             (SELECT COUNT(*) FROM quiz_attempts WHERE user_id = users.id) as quiz_count,
             (SELECT SUM(correct) FROM quiz_attempts WHERE user_id = users.id) as correct_count
      FROM users
      ORDER BY created_at DESC
    `).all();

    res.json({ users });
  });

  // Beta signup (no auth required)
  router.post('/beta-signup', async (req, res) => {
    try {
      const {
        name, email, role, institution, specialty,
        studyTime, currentTools, motivation,
        interview, referrals, timestamp, source
      } = req.body;

      if (!name || !email || !role || !institution || !studyTime || !motivation) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const existingSignup = db.prepare('SELECT id FROM beta_signups WHERE email = ?').get(email);
      if (existingSignup) {
        return res.json({
          success: true,
          message: 'Already registered! We\'ll be in touch soon.',
          existing: true
        });
      }

      const signupId = uuidv4();
      db.prepare(`
        INSERT INTO beta_signups (
          id, name, email, role, institution, specialty, study_time,
          current_tools, motivation, wants_interview, can_refer,
          timestamp, source, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        signupId,
        name.trim(),
        email.toLowerCase().trim(),
        role,
        institution.trim(),
        specialty || null,
        studyTime,
        Array.isArray(currentTools) ? currentTools.join(',') : '',
        motivation.trim(),
        interview === 'yes' ? 1 : 0,
        referrals === 'yes' ? 1 : 0,
        timestamp || new Date().toISOString(),
        source || 'beta-signup',
        'pending'
      );

      console.log(`✅ New beta signup: ${name} (${email}) - ${role} at ${institution}`);

      res.json({
        success: true,
        message: 'Beta signup successful! Check your email for next steps.',
        signupId: signupId
      });
    } catch (error) {
      console.error('Beta signup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get beta signups (admin only)
  router.get('/beta-signups', requireAdmin, (req, res) => {
    try {
      const signups = db.prepare(`
        SELECT id, name, email, role, institution, specialty, study_time,
               current_tools, motivation, wants_interview, can_refer,
               timestamp, status, created_at
        FROM beta_signups
        ORDER BY created_at DESC
      `).all();

      res.json({ success: true, signups });
    } catch (error) {
      console.error('Error fetching beta signups:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update beta signup status (admin only)
  router.post('/beta-signups/:id/status', requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const validStatuses = ['pending', 'contacted', 'interviewed', 'activated', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const result = db.prepare(`
        UPDATE beta_signups
        SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, notes || null, id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Beta signup not found' });
      }

      res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
      console.error('Error updating beta signup:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Interview request (no auth required)
  router.post('/interview-request', async (req, res) => {
    try {
      const {
        name, email, role, institution, timezone,
        selectedTimes, platformPreference, studyHabits,
        mainChallenge, additionalNotes, timestamp, source
      } = req.body;

      if (!name || !email || !role || !institution || !timezone || !selectedTimes || !studyHabits || !mainChallenge) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const requestId = uuidv4();
      db.prepare(`
        INSERT INTO interview_requests (
          id, name, email, role, institution, timezone, preferred_times,
          platform_preference, study_habits, main_challenge, additional_notes,
          timestamp, source, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        requestId,
        name.trim(),
        email.toLowerCase().trim(),
        role,
        institution.trim(),
        timezone,
        Array.isArray(selectedTimes) ? selectedTimes.join('; ') : selectedTimes,
        platformPreference || 'any',
        studyHabits.trim(),
        mainChallenge.trim(),
        additionalNotes ? additionalNotes.trim() : null,
        timestamp || new Date().toISOString(),
        source || 'interview-scheduling',
        'pending'
      );

      console.log(`🗣️ New interview request: ${name} (${email}) - ${role} at ${institution}`);

      res.json({
        success: true,
        message: 'Interview request submitted successfully!',
        requestId: requestId
      });
    } catch (error) {
      console.error('Interview request error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get interview requests (admin only)
  router.get('/interview-requests', requireAdmin, (req, res) => {
    try {
      const requests = db.prepare(`
        SELECT id, name, email, role, institution, timezone, preferred_times,
               platform_preference, study_habits, main_challenge, additional_notes,
               timestamp, status, created_at
        FROM interview_requests
        ORDER BY created_at DESC
      `).all();

      res.json({ success: true, requests });
    } catch (error) {
      console.error('Error fetching interview requests:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Analytics
  router.get('/analytics', requireAdmin, (req, res) => {
    const caseCount = db.prepare('SELECT COUNT(*) as count FROM cases').get();
    const imageCount = db.prepare('SELECT COUNT(*) as count FROM images').get();
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get();

    const byModality = db.prepare(`
      SELECT modality, COUNT(*) as count
      FROM cases
      WHERE modality IS NOT NULL
      GROUP BY modality
      ORDER BY count DESC
    `).all();

    const byBodyPart = db.prepare(`
      SELECT body_part, COUNT(*) as count
      FROM cases
      WHERE body_part IS NOT NULL
      GROUP BY body_part
      ORDER BY count DESC
    `).all();

    const recentCases = db.prepare(`
      SELECT id, title, modality, created_at
      FROM cases
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    res.json({
      counts: {
        cases: caseCount.count,
        images: imageCount.count,
        tags: tagCount.count
      },
      byModality,
      byBodyPart,
      recentCases
    });
  });

  // AI Configuration
  function getAIConfig() {
    const rows = db.prepare('SELECT key, value FROM ai_config').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    return config;
  }

  function setAIConfig(key, value) {
    db.prepare('INSERT OR REPLACE INTO ai_config (key, value) VALUES (?, ?)').run(key, value);
  }

  router.get('/ai/status', requireAdmin, (req, res) => {
    const config = getAIConfig();
    res.json({
      configured: !!(config.provider && config.apiKey),
      provider: config.provider || null,
      model: config.model || null
    });
  });

  router.post('/ai/configure', requireAdmin, (req, res) => {
    const { provider, apiKey, model, baseUrl } = req.body;
    if (provider) setAIConfig('provider', provider);
    if (apiKey) setAIConfig('apiKey', apiKey);
    if (model) setAIConfig('model', model);
    if (baseUrl) setAIConfig('baseUrl', baseUrl);
    res.json({ success: true });
  });

  router.post('/ai/chat', requireAdmin, async (req, res) => {
    const config = getAIConfig();
    if (!config.provider || !config.apiKey) {
      return res.status(400).json({ error: 'AI not configured' });
    }
    const { systemPrompt, messages } = req.body;
    try {
      const response = await callAI(config, systemPrompt, messages);
      res.json({ response });
    } catch (err) {
      res.status(500).json({ error: 'Request failed. Please try again.' });
    }
  });

  router.post('/ai/complete', requireAdmin, async (req, res) => {
    const config = getAIConfig();
    if (!config.provider || !config.apiKey) {
      return res.status(400).json({ error: 'AI not configured' });
    }
    const { prompt, maxTokens } = req.body;
    try {
      const response = await callAI(config, 'You are a helpful radiology education assistant.', [
        { role: 'user', content: prompt }
      ], maxTokens);
      res.json({ response });
    } catch (err) {
      res.status(500).json({ error: 'Request failed. Please try again.' });
    }
  });

  // Export all cases
  router.get('/export', requireAdmin, (req, res) => {
    const cases = db.prepare(`
      SELECT c.*, GROUP_CONCAT(DISTINCT t.name) as tags
      FROM cases c
      LEFT JOIN case_tags ct ON c.id = ct.case_id
      LEFT JOIN tags t ON ct.tag_id = t.id
      GROUP BY c.id
    `).all();

    const exportData = cases.map(c => {
      const images = db.prepare('SELECT * FROM images WHERE case_id = ?').all(c.id);
      return {
        ...c,
        tags: c.tags ? c.tags.split(',') : [],
        images: images.map(img => ({
          ...img,
          data: fs.existsSync(path.join(UPLOAD_DIR, img.filename))
            ? fs.readFileSync(path.join(UPLOAD_DIR, img.filename), 'base64')
            : null
        }))
      };
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="radcase-export-${new Date().toISOString().split('T')[0]}.json"`);
    res.json({
      version: 1,
      exportDate: new Date().toISOString(),
      caseCount: cases.length,
      cases: exportData
    });
  });

  // Import cases
  router.post('/import', requireAdmin, express.json({ limit: '100mb' }), async (req, res) => {
    const { cases } = req.body;

    if (!cases || !Array.isArray(cases)) {
      return res.status(400).json({ error: 'Invalid import format' });
    }

    let imported = 0;
    let errors = [];

    for (const c of cases) {
      try {
        const id = uuidv4();

        db.prepare(`
          INSERT INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, c.title, c.modality, c.body_part, c.diagnosis, c.difficulty || 2, c.clinical_history, c.teaching_points, c.findings);

        if (c.tags && c.tags.length > 0) {
          const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
          const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
          const linkTag = db.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)');

          for (const tagName of c.tags) {
            insertTag.run(tagName.trim().toLowerCase());
            const tag = getTagId.get(tagName.trim().toLowerCase());
            if (tag) linkTag.run(id, tag.id);
          }
        }

        if (c.images && c.images.length > 0) {
          for (let i = 0; i < c.images.length; i++) {
            const img = c.images[i];
            if (img.data) {
              const imageId = uuidv4();
              const ext = path.extname(img.original_name || img.filename || '.jpg');
              const filename = `${imageId}${ext}`;

              const buffer = Buffer.from(img.data, 'base64');
              fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

              try {
                await sharp(buffer)
                  .resize(400, 400, { fit: 'inside' })
                  .toFile(path.join(THUMB_DIR, filename));
                const webpName = filename.replace(/\.[^.]+$/, '.webp');
                await sharp(buffer)
                  .resize(400, 400, { fit: 'inside' })
                  .webp({ quality: 80 })
                  .toFile(path.join(THUMB_DIR, webpName));
              } catch (e) {
                fs.copyFileSync(path.join(UPLOAD_DIR, filename), path.join(THUMB_DIR, filename));
              }

              db.prepare(`
                INSERT INTO images (id, case_id, filename, original_name, sequence, annotations)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(imageId, id, filename, img.original_name, i, img.annotations);
            }
          }
        }

        imported++;
      } catch (err) {
        errors.push({ case: c.title, error: err.message });
      }
    }

    res.json({ imported, errors });
  });

  // Get all tags
  router.get('/tags', requireAdmin, (req, res) => {
    const { cacheMiddleware: cm } = require('../lib/cache');
    const tags = db.prepare(`
      SELECT t.name, COUNT(ct.case_id) as count
      FROM tags t
      LEFT JOIN case_tags ct ON t.id = ct.tag_id
      GROUP BY t.id
      ORDER BY count DESC
    `).all();
    res.json(tags);
  });

  // Get filter options (distinct values)
  router.get('/filters', requireAdmin, (req, res) => {
    const modalities = db.prepare('SELECT DISTINCT modality FROM cases WHERE modality IS NOT NULL ORDER BY modality').all();
    const bodyParts = db.prepare('SELECT DISTINCT body_part FROM cases WHERE body_part IS NOT NULL ORDER BY body_part').all();

    res.json({
      modalities: modalities.map(m => m.modality),
      bodyParts: bodyParts.map(b => b.body_part),
      difficulties: [1, 2, 3, 4, 5]
    });
  });

  // Delete image
  router.delete('/images/:id', requireAuth, (req, res) => {
    const image = db.prepare('SELECT filename FROM images WHERE id = ?').get(req.params.id);
    if (image) {
      const webpName = image.filename.replace(/\.[^.]+$/, '.webp');
      try { fs.unlinkSync(path.join(UPLOAD_DIR, image.filename)); } catch (_) {}
      try { fs.unlinkSync(path.join(THUMB_DIR, image.filename)); } catch (_) {}
      try { fs.unlinkSync(path.join(THUMB_DIR, webpName)); } catch (_) {}
    }
    db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
    res.json({ message: 'Image deleted' });
  });

  // Scan for orphaned files (files on disk with no DB record)
  // GET returns a report, POST with ?clean=true deletes orphans
  router.get('/orphaned-files', requireAdmin, (req, res) => {
    const DICOM_DIR = path.join(__dirname, '..', 'dicom');
    const report = findOrphanedFiles(db, UPLOAD_DIR, THUMB_DIR, DICOM_DIR);
    res.json(report);
  });

  router.post('/orphaned-files/clean', requireAdmin, (req, res) => {
    const DICOM_DIR = path.join(__dirname, '..', 'dicom');
    const report = findOrphanedFiles(db, UPLOAD_DIR, THUMB_DIR, DICOM_DIR);

    let cleaned = 0;
    for (const f of report.orphanedUploads) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); cleaned++; } catch (_) {}
    }
    for (const f of report.orphanedThumbnails) {
      try { fs.unlinkSync(path.join(THUMB_DIR, f)); cleaned++; } catch (_) {}
    }
    for (const d of report.orphanedDicomDirs) {
      try { fs.rmSync(path.join(DICOM_DIR, d), { recursive: true, force: true }); cleaned++; } catch (_) {}
    }

    res.json({ ...report, cleaned });
  });

  // Update image annotations (top-level route)
  router.put('/images/:id/annotations', requireAuth, (req, res) => {
    const { annotations } = req.body;
    db.prepare('UPDATE images SET annotations = ? WHERE id = ?').run(JSON.stringify(annotations), req.params.id);
    res.json({ message: 'Annotations saved' });
  });

  return router;
};

// Find files on disk that have no corresponding database record
function findOrphanedFiles(db, uploadDir, thumbDir, dicomDir) {
  // Get all known filenames from DB
  const dbImages = new Set(
    db.prepare('SELECT filename FROM images').all().map(r => r.filename)
  );
  const dbDicomDirs = new Set(
    db.prepare('SELECT folder_name FROM dicom_series').all().map(r => r.folder_name)
  );

  // Also build a set of expected WebP thumbnail names
  const dbWebpNames = new Set();
  for (const name of dbImages) {
    dbWebpNames.add(name.replace(/\.[^.]+$/, '.webp'));
  }

  // Scan uploads directory
  const orphanedUploads = [];
  try {
    for (const f of fs.readdirSync(uploadDir)) {
      if (!dbImages.has(f)) orphanedUploads.push(f);
    }
  } catch (_) {}

  // Scan thumbnails directory (includes WebP variants)
  const orphanedThumbnails = [];
  try {
    for (const f of fs.readdirSync(thumbDir)) {
      if (!dbImages.has(f) && !dbWebpNames.has(f)) orphanedThumbnails.push(f);
    }
  } catch (_) {}

  // Scan DICOM directories
  const orphanedDicomDirs = [];
  try {
    for (const d of fs.readdirSync(dicomDir)) {
      const full = path.join(dicomDir, d);
      if (fs.statSync(full).isDirectory() && !dbDicomDirs.has(d)) {
        orphanedDicomDirs.push(d);
      }
    }
  } catch (_) {}

  // Calculate wasted disk space
  let orphanedBytes = 0;
  for (const f of orphanedUploads) {
    try { orphanedBytes += fs.statSync(path.join(uploadDir, f)).size; } catch (_) {}
  }
  for (const f of orphanedThumbnails) {
    try { orphanedBytes += fs.statSync(path.join(thumbDir, f)).size; } catch (_) {}
  }
  for (const d of orphanedDicomDirs) {
    const dir = path.join(dicomDir, d);
    try {
      for (const f of fs.readdirSync(dir)) {
        try { orphanedBytes += fs.statSync(path.join(dir, f)).size; } catch (_) {}
      }
    } catch (_) {}
  }

  return {
    orphanedUploads,
    orphanedThumbnails,
    orphanedDicomDirs,
    totalOrphaned: orphanedUploads.length + orphanedThumbnails.length + orphanedDicomDirs.length,
    orphanedBytes,
    orphanedMB: Math.round(orphanedBytes / 1024 / 1024 * 100) / 100
  };
}

// Generic AI call function supporting multiple providers
async function callAI(config, systemPrompt, messages, maxTokens = 1000) {
  const provider = config.provider.toLowerCase();

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  if (provider === 'openai' || provider === 'openai-compatible') {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const model = config.model || 'gpt-4o-mini';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        max_tokens: maxTokens,
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'API error');
    return data.choices[0].message.content;
  }

  if (provider === 'anthropic') {
    const model = config.model || 'claude-3-haiku-20240307';

    const anthropicMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: anthropicMessages
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'API error');
    return data.content[0].text;
  }

  if (provider === 'ollama') {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    const model = config.model || 'llama2';

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: fullMessages,
        stream: false
      })
    });

    const data = await response.json();
    return data.message.content;
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}
