const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const AICaseBuilder = require('../lib/ai-case-builder');

module.exports = function(db) {
  const router = express.Router();
  const builder = new AICaseBuilder(db);

  // Check if AI is configured
  router.get('/status', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM ai_config').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    res.json({
      configured: !!(config.provider && config.apiKey),
      provider: config.provider || null,
      model: config.model || null
    });
  });

  // Generate a new case from report + DICOM metadata
  router.post('/generate', requireAdmin, async (req, res) => {
    const { reportText, dicomMetadata } = req.body;
    if (!reportText || reportText.trim().length < 20) {
      return res.status(400).json({ error: 'Report text is required (minimum 20 characters)' });
    }
    try {
      const result = await builder.generateCase(reportText, dicomMetadata || {}, req.user.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Case generation failed. Please try again.' });
    }
  });

  // List drafts (with filtering by status)
  router.get('/drafts', requireAdmin, (req, res) => {
    const { status } = req.query;
    let query = 'SELECT id, status, ai_provider, ai_model, generation_time_ms, created_by, reviewed_by, created_at, updated_at FROM case_drafts';
    const params = [];
    if (status) { query += ' WHERE status = ?'; params.push(status); }
    query += ' ORDER BY created_at DESC';
    const drafts = db.prepare(query).all(...params);
    // For each draft, parse a title from generated_content if available
    const enriched = drafts.map(d => {
      let title = 'Untitled Draft';
      try {
        const gc = db.prepare('SELECT generated_content FROM case_drafts WHERE id = ?').get(d.id);
        if (gc && gc.generated_content) {
          const content = JSON.parse(gc.generated_content);
          title = content.title || title;
        }
      } catch (e) {}
      return { ...d, title };
    });
    res.json({ drafts: enriched });
  });

  // Get single draft with full content + references
  router.get('/drafts/:id', requireAdmin, (req, res) => {
    const draft = db.prepare('SELECT * FROM case_drafts WHERE id = ?').get(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    const references = db.prepare('SELECT * FROM case_references WHERE draft_id = ? ORDER BY quality_score DESC').all(req.params.id);
    res.json({
      ...draft,
      generated_content: draft.generated_content ? JSON.parse(draft.generated_content) : null,
      references
    });
  });

  // Update draft content (admin editing sections)
  router.put('/drafts/:id', requireAdmin, (req, res) => {
    const draft = db.prepare('SELECT * FROM case_drafts WHERE id = ?').get(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status === 'published') return res.status(400).json({ error: 'Cannot edit published draft' });

    const { content, status } = req.body;
    if (content) {
      db.prepare('UPDATE case_drafts SET generated_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(content), req.params.id);
    }
    if (status && ['review', 'approved', 'rejected'].includes(status)) {
      db.prepare('UPDATE case_drafts SET status = ?, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(status, req.user.id, req.params.id);
    }
    res.json({ success: true });
  });

  // Approve a draft
  router.post('/drafts/:id/approve', requireAdmin, (req, res) => {
    const draft = db.prepare('SELECT status FROM case_drafts WHERE id = ?').get(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status !== 'review') return res.status(400).json({ error: 'Draft must be in review status' });
    db.prepare('UPDATE case_drafts SET status = ?, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('approved', req.user.id, req.params.id);
    res.json({ success: true, status: 'approved' });
  });

  // Reject a draft
  router.post('/drafts/:id/reject', requireAdmin, (req, res) => {
    const { reason } = req.body;
    const draft = db.prepare('SELECT status FROM case_drafts WHERE id = ?').get(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    db.prepare('UPDATE case_drafts SET status = ?, review_notes = ?, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('rejected', reason || '', req.user.id, req.params.id);
    res.json({ success: true, status: 'rejected' });
  });

  // Publish an approved draft to the case library
  router.post('/drafts/:id/publish', requireAdmin, (req, res) => {
    try {
      const result = builder.publishDraft(req.params.id, req.user.id);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: 'Publish failed. Please check the draft status.' });
    }
  });

  // Regenerate a specific section of a draft
  router.post('/drafts/:id/regenerate-section', requireAdmin, async (req, res) => {
    const { section, instructions } = req.body;
    const draft = db.prepare('SELECT * FROM case_drafts WHERE id = ?').get(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const content = JSON.parse(draft.generated_content);
    const prompt = `Regenerate the "${section}" section of this radiology teaching case.

Case: ${content.title}
Diagnosis: ${content.diagnosis}
Findings: ${content.findings}
${instructions ? `\nAdditional instructions: ${instructions}` : ''}

Return ONLY the regenerated ${section} content as valid JSON (matching the original format for this section).`;

    try {
      const newSection = await builder.ai.generateJSON(prompt, { maxTokens: 2000 });
      content[section] = newSection;
      db.prepare('UPDATE case_drafts SET generated_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(JSON.stringify(content), req.params.id);
      res.json({ success: true, section, content: newSection });
    } catch (err) {
      res.status(500).json({ error: 'Regeneration failed. Please try again.' });
    }
  });

  // Delete a draft
  router.delete('/drafts/:id', requireAdmin, (req, res) => {
    const draft = db.prepare('SELECT status FROM case_drafts WHERE id = ?').get(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.status === 'published') return res.status(400).json({ error: 'Cannot delete published draft' });
    db.prepare('DELETE FROM case_drafts WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  return router;
};
