const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { TEST_USERS, registerUser } = require('./setup');

const app = require('../server');

const ReportParser = require('../lib/report-parser');

// Helper to create an admin user and get cookie directly via DB
function createAdminCookie() {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  const id = uuidv4();
  const username = `cb_admin_${crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = bcrypt.hashSync('adminpass123', 4);
  db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, username, `${username}@test.com`, passwordHash, 'CB Admin', 'admin');
  db.close();
  const token = jwt.sign(
    { id, username, displayName: 'CB Admin', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { cookie: [`token=${token}; Path=/; HttpOnly`], userId: id };
}

function createResidentCookie() {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  const id = uuidv4();
  const username = `cb_resident_${crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = bcrypt.hashSync('residentpass123', 4);
  db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, username, `${username}@test.com`, passwordHash, 'CB Resident', 'resident');
  db.close();
  const token = jwt.sign(
    { id, username, displayName: 'CB Resident', role: 'resident' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { cookie: [`token=${token}; Path=/; HttpOnly`], userId: id };
}

// Helper to insert a draft directly in the DB
function insertDraft(id, status, createdBy, content = null) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  const generated = content ? JSON.stringify(content) : JSON.stringify({
    title: 'Test Draft Case',
    diagnosis: 'Pneumonia',
    findings: 'Consolidation in right lower lobe',
    clinical_history: 'Cough and fever',
    teaching_points: 'Key teaching point',
    differentials: [],
    difficulty: 3,
    category: 'common'
  });
  db.prepare(`INSERT INTO case_drafts (id, source_report, source_dicom_metadata, generated_content, status, created_by)
    VALUES (?, 'test report text for testing purposes', '{}', ?, ?, ?)`).run(id, generated, status, createdBy);
  db.close();
}

function deleteDraft(id) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare('DELETE FROM case_references WHERE draft_id = ?').run(id);
  db.prepare('DELETE FROM case_drafts WHERE id = ?').run(id);
  db.close();
}

describe('Case Builder API', () => {
  let adminAuth;
  let residentAuth;

  beforeAll(() => {
    adminAuth = createAdminCookie();
    residentAuth = createResidentCookie();
  });

  describe('GET /api/case-builder/status', () => {
    test('should return AI configuration status', async () => {
      const res = await request(app)
        .get('/api/case-builder/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('configured');
      expect(typeof res.body.configured).toBe('boolean');
      expect(res.body).toHaveProperty('provider');
      expect(res.body).toHaveProperty('model');
    });
  });

  describe('POST /api/case-builder/generate', () => {
    test('should require admin auth', async () => {
      const res = await request(app)
        .post('/api/case-builder/generate')
        .send({ reportText: 'This is a test radiology report with sufficient text.' });

      expect(res.status).toBe(401);
    });

    test('should reject non-admin users', async () => {
      const res = await request(app)
        .post('/api/case-builder/generate')
        .set('Cookie', residentAuth.cookie)
        .send({ reportText: 'This is a test radiology report with sufficient text.' });

      expect(res.status).toBe(403);
    });

    test('should require report text', async () => {
      const res = await request(app)
        .post('/api/case-builder/generate')
        .set('Cookie', adminAuth.cookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Report text is required');
    });

    test('should require minimum report text length', async () => {
      const res = await request(app)
        .post('/api/case-builder/generate')
        .set('Cookie', adminAuth.cookie)
        .send({ reportText: 'Too short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('minimum 20 characters');
    });
  });

  describe('GET /api/case-builder/drafts', () => {
    test('should require admin auth', async () => {
      const res = await request(app)
        .get('/api/case-builder/drafts');

      expect(res.status).toBe(401);
    });

    test('should return drafts list for admin', async () => {
      const res = await request(app)
        .get('/api/case-builder/drafts')
        .set('Cookie', adminAuth.cookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('drafts');
      expect(Array.isArray(res.body.drafts)).toBe(true);
    });

    test('should filter drafts by status', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'review', adminAuth.userId);

      try {
        const res = await request(app)
          .get('/api/case-builder/drafts?status=review')
          .set('Cookie', adminAuth.cookie);

        expect(res.status).toBe(200);
        expect(res.body.drafts.length).toBeGreaterThanOrEqual(1);
        res.body.drafts.forEach(d => expect(d.status).toBe('review'));
      } finally {
        deleteDraft(draftId);
      }
    });
  });

  describe('GET /api/case-builder/drafts/:id', () => {
    test('should return 404 for non-existent draft', async () => {
      const res = await request(app)
        .get('/api/case-builder/drafts/nonexistent-id')
        .set('Cookie', adminAuth.cookie);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Draft not found');
    });

    test('should return draft with content and references', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'review', adminAuth.userId);

      try {
        const res = await request(app)
          .get(`/api/case-builder/drafts/${draftId}`)
          .set('Cookie', adminAuth.cookie);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(draftId);
        expect(res.body.status).toBe('review');
        expect(res.body.generated_content).toBeDefined();
        expect(res.body.generated_content.title).toBe('Test Draft Case');
        expect(res.body.references).toBeDefined();
        expect(Array.isArray(res.body.references)).toBe(true);
      } finally {
        deleteDraft(draftId);
      }
    });
  });

  describe('PUT /api/case-builder/drafts/:id', () => {
    test('should update draft content', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'review', adminAuth.userId);

      try {
        const updatedContent = {
          title: 'Updated Draft Title',
          diagnosis: 'Updated Diagnosis',
          findings: 'Updated findings',
          clinical_history: 'Updated history',
          teaching_points: 'Updated points',
          differentials: [],
          difficulty: 4,
          category: 'classic'
        };

        const res = await request(app)
          .put(`/api/case-builder/drafts/${draftId}`)
          .set('Cookie', adminAuth.cookie)
          .send({ content: updatedContent });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify the update
        const getRes = await request(app)
          .get(`/api/case-builder/drafts/${draftId}`)
          .set('Cookie', adminAuth.cookie);

        expect(getRes.body.generated_content.title).toBe('Updated Draft Title');
      } finally {
        deleteDraft(draftId);
      }
    });

    test('should not allow editing a published draft', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'published', adminAuth.userId);

      try {
        const res = await request(app)
          .put(`/api/case-builder/drafts/${draftId}`)
          .set('Cookie', adminAuth.cookie)
          .send({ content: { title: 'Should not update' } });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cannot edit published draft');
      } finally {
        deleteDraft(draftId);
      }
    });
  });

  describe('POST /api/case-builder/drafts/:id/approve', () => {
    test('should approve a draft in review status', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'review', adminAuth.userId);

      try {
        const res = await request(app)
          .post(`/api/case-builder/drafts/${draftId}/approve`)
          .set('Cookie', adminAuth.cookie);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('approved');

        // Verify status changed
        const getRes = await request(app)
          .get(`/api/case-builder/drafts/${draftId}`)
          .set('Cookie', adminAuth.cookie);
        expect(getRes.body.status).toBe('approved');
      } finally {
        deleteDraft(draftId);
      }
    });

    test('should reject approval of non-review draft', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'generating', adminAuth.userId);

      try {
        const res = await request(app)
          .post(`/api/case-builder/drafts/${draftId}/approve`)
          .set('Cookie', adminAuth.cookie);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('must be in review status');
      } finally {
        deleteDraft(draftId);
      }
    });

    test('should return 404 for non-existent draft', async () => {
      const res = await request(app)
        .post('/api/case-builder/drafts/nonexistent-id/approve')
        .set('Cookie', adminAuth.cookie);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/case-builder/drafts/:id/reject', () => {
    test('should reject a draft with reason', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'review', adminAuth.userId);

      try {
        const res = await request(app)
          .post(`/api/case-builder/drafts/${draftId}/reject`)
          .set('Cookie', adminAuth.cookie)
          .send({ reason: 'Findings are inaccurate' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('rejected');

        // Verify status and reason
        const getRes = await request(app)
          .get(`/api/case-builder/drafts/${draftId}`)
          .set('Cookie', adminAuth.cookie);
        expect(getRes.body.status).toBe('rejected');
        expect(getRes.body.review_notes).toBe('Findings are inaccurate');
      } finally {
        deleteDraft(draftId);
      }
    });

    test('should return 404 for non-existent draft', async () => {
      const res = await request(app)
        .post('/api/case-builder/drafts/nonexistent-id/reject')
        .set('Cookie', adminAuth.cookie)
        .send({ reason: 'Not good' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/case-builder/drafts/:id/publish', () => {
    test('should require approved status to publish', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'review', adminAuth.userId);

      try {
        const res = await request(app)
          .post(`/api/case-builder/drafts/${draftId}/publish`)
          .set('Cookie', adminAuth.cookie);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('must be approved');
      } finally {
        deleteDraft(draftId);
      }
    });

    test('should publish an approved draft', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'approved', adminAuth.userId);

      let publishedCaseId;
      try {
        const res = await request(app)
          .post(`/api/case-builder/drafts/${draftId}/publish`)
          .set('Cookie', adminAuth.cookie);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.caseId).toBeDefined();
        expect(res.body.title).toBe('Test Draft Case');
        publishedCaseId = res.body.caseId;

        // Verify the case exists in the cases table
        const caseRes = await request(app)
          .get(`/api/cases/${publishedCaseId}`)
          .set('Cookie', adminAuth.cookie);
        expect(caseRes.status).toBe(200);
        expect(caseRes.body.title).toBe('Test Draft Case');
      } finally {
        // Clean up
        const db = new Database(path.join(__dirname, '..', 'radcase.db'));
        if (publishedCaseId) {
          db.prepare('DELETE FROM case_key_findings WHERE case_id = ?').run(publishedCaseId);
          db.prepare('DELETE FROM cases WHERE id = ?').run(publishedCaseId);
        }
        db.prepare('DELETE FROM case_references WHERE draft_id = ?').run(draftId);
        db.prepare('DELETE FROM case_drafts WHERE id = ?').run(draftId);
        db.close();
      }
    });

    test('should return 400 for non-existent draft', async () => {
      const res = await request(app)
        .post('/api/case-builder/drafts/nonexistent-id/publish')
        .set('Cookie', adminAuth.cookie);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Draft not found');
    });
  });

  describe('DELETE /api/case-builder/drafts/:id', () => {
    test('should delete a non-published draft', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'review', adminAuth.userId);

      const res = await request(app)
        .delete(`/api/case-builder/drafts/${draftId}`)
        .set('Cookie', adminAuth.cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/case-builder/drafts/${draftId}`)
        .set('Cookie', adminAuth.cookie);
      expect(getRes.status).toBe(404);
    });

    test('should not delete a published draft', async () => {
      const draftId = uuidv4();
      insertDraft(draftId, 'published', adminAuth.userId);

      try {
        const res = await request(app)
          .delete(`/api/case-builder/drafts/${draftId}`)
          .set('Cookie', adminAuth.cookie);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cannot delete published draft');
      } finally {
        deleteDraft(draftId);
      }
    });

    test('should return 404 for non-existent draft', async () => {
      const res = await request(app)
        .delete('/api/case-builder/drafts/nonexistent-id')
        .set('Cookie', adminAuth.cookie);

      expect(res.status).toBe(404);
    });
  });
});

describe('ReportParser', () => {
  const parser = new ReportParser();

  describe('parse()', () => {
    test('should parse a standard radiology report', () => {
      const report = `EXAM: CT Chest with contrast

CLINICAL HISTORY: 45 year old male with cough and fever for 3 days.

COMPARISON: No prior studies available.

TECHNIQUE: CT of the chest was performed with IV contrast.

FINDINGS: There is consolidation in the right lower lobe. No pleural effusion. Heart size is normal. No mediastinal lymphadenopathy.

IMPRESSION: Right lower lobe pneumonia. No complications.`;

      const sections = parser.parse(report);

      expect(sections.exam).toContain('CT Chest');
      expect(sections.clinical_history).toContain('45 year old');
      expect(sections.comparison).toContain('No prior');
      expect(sections.technique).toContain('IV contrast');
      expect(sections.findings).toContain('consolidation');
      expect(sections.impression).toContain('pneumonia');
      expect(sections.raw).toBe(report);
    });

    test('should handle reports with varying header formats', () => {
      const report = `INDICATION: Chest pain, rule out PE

FINDINGS - Filling defect in the right pulmonary artery consistent with pulmonary embolism.

CONCLUSION: Acute pulmonary embolism.`;

      const sections = parser.parse(report);

      expect(sections.clinical_history).toContain('Chest pain');
      expect(sections.findings).toContain('Filling defect');
      expect(sections.impression).toContain('pulmonary embolism');
    });

    test('should use full text as findings when no headers found', () => {
      const report = 'Normal chest radiograph. No acute cardiopulmonary process.';
      const sections = parser.parse(report);

      expect(sections.findings).toBe(report);
    });

    test('should handle empty report', () => {
      const sections = parser.parse('');
      expect(sections.findings).toBe('');
      expect(sections.raw).toBe('');
    });
  });

  describe('extractModality()', () => {
    test('should extract CT modality', () => {
      expect(parser.extractModality('CT Chest with contrast', {})).toBe('CT');
    });

    test('should extract MRI modality', () => {
      expect(parser.extractModality('MRI Brain without contrast', {})).toBe('MRI');
    });

    test('should extract X-Ray modality', () => {
      expect(parser.extractModality('Chest X-Ray PA and lateral', {})).toBe('X-Ray');
    });

    test('should extract Ultrasound modality', () => {
      expect(parser.extractModality('Right upper quadrant ultrasound', {})).toBe('Ultrasound');
    });

    test('should prefer DICOM metadata if available', () => {
      expect(parser.extractModality('CT scan report', { modality: 'MRI' })).toBe('MRI');
    });

    test('should return empty string for unknown modality', () => {
      expect(parser.extractModality('Some generic text', {})).toBe('');
    });
  });

  describe('extractBodyPart()', () => {
    test('should extract Chest', () => {
      expect(parser.extractBodyPart('CT of the chest', {})).toBe('Chest');
    });

    test('should extract Head', () => {
      expect(parser.extractBodyPart('MRI of the brain', {})).toBe('Head');
    });

    test('should extract Abdomen', () => {
      expect(parser.extractBodyPart('CT abdomen and pelvis', {})).toBe('Abdomen');
    });

    test('should extract Spine', () => {
      expect(parser.extractBodyPart('MRI lumbar spine', {})).toBe('Spine');
    });

    test('should prefer DICOM metadata if available', () => {
      expect(parser.extractBodyPart('Chest x-ray', { bodyPart: 'Abdomen' })).toBe('Abdomen');
    });

    test('should return empty string for unknown body part', () => {
      expect(parser.extractBodyPart('Generic procedure', {})).toBe('');
    });
  });
});
