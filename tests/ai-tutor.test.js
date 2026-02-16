const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Ensure test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET;

// Helper to create a resident user and get auth cookie
function createResidentCookie() {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  const id = uuidv4();
  const username = `ai_resident_${crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = bcrypt.hashSync('residentpass123', 4);
  db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role, trainee_level) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, username, `${username}@test.com`, passwordHash, 'AI Resident', 'resident', 'resident');
  db.close();
  const token = jwt.sign(
    { id, username, displayName: 'AI Resident', role: 'resident', traineeLevel: 'resident' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { cookie: [`token=${token}; Path=/; HttpOnly`], userId: id, username };
}

// Helper to insert a test case
function insertTestCase(id) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare(`INSERT OR IGNORE INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings, differentials)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    'Test Pneumothorax Case',
    'X-Ray',
    'Chest',
    'Right pneumothorax',
    3,
    '25 year old male with sudden onset chest pain and dyspnea',
    'Look for visceral pleural line. Absence of lung markings peripherally.',
    'Visceral pleural line visible along the right lateral chest wall. No lung markings seen peripheral to this line.',
    JSON.stringify(['Pneumothorax', 'Pneumomediastinum', 'Skin fold artifact', 'Bullous emphysema'])
  );
  db.close();
}

// Helper to clean up test data
function cleanupTestCase(id) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare('DELETE FROM report_attempts WHERE case_id = ?').run(id);
  db.prepare('DELETE FROM ai_conversations WHERE case_id = ?').run(id);
  db.prepare('DELETE FROM cases WHERE id = ?').run(id);
  db.close();
}

function cleanupTestUser(userId) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare('DELETE FROM ai_conversations WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM report_attempts WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM weakness_analysis WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  db.close();
}

describe('AI Tutor API', () => {
  let residentAuth;
  let testCaseId;

  beforeAll(() => {
    residentAuth = createResidentCookie();
    testCaseId = uuidv4();
    insertTestCase(testCaseId);
  });

  afterAll(() => {
    cleanupTestCase(testCaseId);
    cleanupTestUser(residentAuth.userId);
  });

  // ============ GET /api/ai/status ============
  describe('GET /api/ai/status', () => {
    test('should return AI configuration status without auth', async () => {
      const res = await request(app)
        .get('/api/ai/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('configured');
      expect(typeof res.body.configured).toBe('boolean');
      expect(res.body).toHaveProperty('provider');
    });
  });

  // ============ POST /api/ai/chat ============
  describe('POST /api/ai/chat', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    test('should require a message', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Cookie', residentAuth.cookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Message is required');
    });

    test('should reject empty message string', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Cookie', residentAuth.cookie)
        .send({ message: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Message is required');
    });

    test('should return 404 for non-existent case', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Cookie', residentAuth.cookie)
        .send({ caseId: 'nonexistent-case-id', message: 'Tell me about this case' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Case not found');
    });

    test('should return 404 for non-existent conversation', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Cookie', residentAuth.cookie)
        .send({ conversationId: 'nonexistent-convo', message: 'Continue' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Conversation not found');
    });
  });

  // ============ POST /api/ai/hint/:caseId ============
  describe('POST /api/ai/hint/:caseId', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/ai/hint/${testCaseId}`)
        .send({ hintLevel: 1 });

      expect(res.status).toBe(401);
    });

    test('should validate hintLevel range', async () => {
      const res = await request(app)
        .post(`/api/ai/hint/${testCaseId}`)
        .set('Cookie', residentAuth.cookie)
        .send({ hintLevel: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('hintLevel must be between 1 and 4');
    });

    test('should reject missing hintLevel', async () => {
      const res = await request(app)
        .post(`/api/ai/hint/${testCaseId}`)
        .set('Cookie', residentAuth.cookie)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('hintLevel must be between 1 and 4');
    });

    test('should reject hintLevel of 0', async () => {
      const res = await request(app)
        .post(`/api/ai/hint/${testCaseId}`)
        .set('Cookie', residentAuth.cookie)
        .send({ hintLevel: 0 });

      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent case', async () => {
      const res = await request(app)
        .post('/api/ai/hint/nonexistent-case-id')
        .set('Cookie', residentAuth.cookie)
        .send({ hintLevel: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Case not found');
    });
  });

  // ============ POST /api/ai/guidance/:caseId ============
  describe('POST /api/ai/guidance/:caseId', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/ai/guidance/${testCaseId}`)
        .send({ step: 'history' });

      expect(res.status).toBe(401);
    });

    test('should validate step', async () => {
      const res = await request(app)
        .post(`/api/ai/guidance/${testCaseId}`)
        .set('Cookie', residentAuth.cookie)
        .send({ step: 'invalid_step' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('step must be one of');
    });

    test('should reject missing step', async () => {
      const res = await request(app)
        .post(`/api/ai/guidance/${testCaseId}`)
        .set('Cookie', residentAuth.cookie)
        .send({});

      expect(res.status).toBe(400);
    });

    test('should return 404 for non-existent case', async () => {
      const res = await request(app)
        .post('/api/ai/guidance/nonexistent-case-id')
        .set('Cookie', residentAuth.cookie)
        .send({ step: 'history' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Case not found');
    });
  });

  // ============ POST /api/ai/evaluate-report ============
  describe('POST /api/ai/evaluate-report', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/ai/evaluate-report')
        .send({ caseId: testCaseId, traineeReport: 'Normal chest x-ray' });

      expect(res.status).toBe(401);
    });

    test('should require caseId', async () => {
      const res = await request(app)
        .post('/api/ai/evaluate-report')
        .set('Cookie', residentAuth.cookie)
        .send({ traineeReport: 'Normal chest x-ray' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('caseId is required');
    });

    test('should require traineeReport', async () => {
      const res = await request(app)
        .post('/api/ai/evaluate-report')
        .set('Cookie', residentAuth.cookie)
        .send({ caseId: testCaseId });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('traineeReport is required');
    });

    test('should reject empty traineeReport', async () => {
      const res = await request(app)
        .post('/api/ai/evaluate-report')
        .set('Cookie', residentAuth.cookie)
        .send({ caseId: testCaseId, traineeReport: '  ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('traineeReport is required');
    });

    test('should return 404 for non-existent case', async () => {
      const res = await request(app)
        .post('/api/ai/evaluate-report')
        .set('Cookie', residentAuth.cookie)
        .send({ caseId: 'nonexistent-case-id', traineeReport: 'Normal chest x-ray' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Case not found');
    });
  });

  // ============ POST /api/ai/weakness-analysis ============
  describe('POST /api/ai/weakness-analysis', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/ai/weakness-analysis');

      expect(res.status).toBe(401);
    });

    test('should return analysis for authenticated user', async () => {
      // Insert some quiz attempts so there's data to analyze
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      for (let i = 0; i < 5; i++) {
        db.prepare("INSERT INTO quiz_attempts (case_id, correct, user_id, attempted_at) VALUES (?, ?, ?, datetime('now'))")
          .run(testCaseId, i % 2, residentAuth.userId);
      }
      db.close();

      const res = await request(app)
        .post('/api/ai/weakness-analysis')
        .set('Cookie', residentAuth.cookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('weaknesses');
      expect(res.body).toHaveProperty('recommendations');
      expect(res.body).toHaveProperty('focusAreas');
      expect(Array.isArray(res.body.weaknesses)).toBe(true);
      expect(Array.isArray(res.body.recommendations)).toBe(true);
      expect(Array.isArray(res.body.focusAreas)).toBe(true);
    });
  });

  // ============ POST /api/ai/practice-recommendations ============
  describe('POST /api/ai/practice-recommendations', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/ai/practice-recommendations');

      expect(res.status).toBe(401);
    });

    test('should return recommendations for authenticated user', async () => {
      const res = await request(app)
        .post('/api/ai/practice-recommendations')
        .set('Cookie', residentAuth.cookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('cases');
      expect(res.body).toHaveProperty('reason');
      expect(Array.isArray(res.body.cases)).toBe(true);
      expect(typeof res.body.reason).toBe('string');
    });
  });

  // ============ Database Tables ============
  describe('Database schema', () => {
    test('ai_conversations table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(ai_conversations)").all();
      const columnNames = info.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('case_id');
      expect(columnNames).toContain('conversation_type');
      expect(columnNames).toContain('messages');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
      db.close();
    });

    test('weakness_analysis table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(weakness_analysis)").all();
      const columnNames = info.map(col => col.name);
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('analysis_data');
      expect(columnNames).toContain('weak_body_parts');
      expect(columnNames).toContain('weak_modalities');
      expect(columnNames).toContain('weak_diagnoses');
      expect(columnNames).toContain('recommended_case_ids');
      expect(columnNames).toContain('last_updated');
      db.close();
    });

    test('report_attempts table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(report_attempts)").all();
      const columnNames = info.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('case_id');
      expect(columnNames).toContain('trainee_report');
      expect(columnNames).toContain('ai_feedback');
      expect(columnNames).toContain('score');
      expect(columnNames).toContain('missed_findings');
      expect(columnNames).toContain('overcalls');
      expect(columnNames).toContain('created_at');
      db.close();
    });
  });

  // ============ AI Tutor Engine Unit Tests ============
  describe('AITutorEngine', () => {
    const AITutorEngine = require('../lib/ai-tutor-engine');
    let engineDb;
    let engineInstance;

    beforeAll(() => {
      engineDb = new Database(path.join(__dirname, '..', 'radcase.db'));
      engineInstance = new AITutorEngine(engineDb);
    });

    afterAll(() => {
      engineDb.close();
    });

    describe('buildSystemPrompt', () => {
      test('should build prompt for student level', () => {
        const prompt = engineInstance.buildSystemPrompt(null, 'student', null);
        expect(prompt).toContain('medical student');
        expect(prompt).toContain('Socratic');
      });

      test('should build prompt for resident level', () => {
        const prompt = engineInstance.buildSystemPrompt(null, 'resident', null);
        expect(prompt).toContain('radiology resident');
      });

      test('should build prompt for fellow level', () => {
        const prompt = engineInstance.buildSystemPrompt(null, 'fellow', null);
        expect(prompt).toContain('radiology fellow');
      });

      test('should include case context when provided', () => {
        const caseData = {
          modality: 'CT',
          body_part: 'Chest',
          difficulty: 3,
          clinical_history: 'Cough and fever',
          diagnosis: 'Pneumonia',
          findings: 'Right lower lobe consolidation'
        };
        const prompt = engineInstance.buildSystemPrompt(caseData, 'resident', 'history');
        expect(prompt).toContain('CT');
        expect(prompt).toContain('Chest');
        expect(prompt).toContain('Cough and fever');
        // Diagnosis should be hidden in history step
        expect(prompt).toContain('DO NOT reveal');
      });

      test('should reveal diagnosis in reveal step', () => {
        const caseData = {
          modality: 'CT',
          body_part: 'Chest',
          diagnosis: 'Pneumonia',
          findings: 'Right lower lobe consolidation',
          teaching_points: 'Key teaching point'
        };
        const prompt = engineInstance.buildSystemPrompt(caseData, 'resident', 'reveal');
        expect(prompt).toContain('Pneumonia');
        expect(prompt).toContain('Right lower lobe consolidation');
        expect(prompt).toContain('Key teaching point');
        expect(prompt).not.toContain('DO NOT reveal');
      });

      test('should include step-specific instructions', () => {
        const prompt = engineInstance.buildSystemPrompt(null, 'resident', 'differential');
        expect(prompt).toContain('differential diagnosis');
      });

      test('should include step instructions for images step', () => {
        const prompt = engineInstance.buildSystemPrompt(null, 'resident', 'images');
        expect(prompt).toContain('systematic approach');
      });
    });

    describe('getRecommendedCases', () => {
      test('should return array of cases', () => {
        const cases = engineInstance.getRecommendedCases(residentAuth.userId, 5);
        expect(Array.isArray(cases)).toBe(true);
        // Each case should have required fields if any exist
        if (cases.length > 0) {
          expect(cases[0]).toHaveProperty('id');
          expect(cases[0]).toHaveProperty('title');
        }
      });

      test('should respect limit parameter', () => {
        const cases = engineInstance.getRecommendedCases(residentAuth.userId, 2);
        expect(cases.length).toBeLessThanOrEqual(2);
      });
    });
  });
});
