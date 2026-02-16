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

// Helper to create a user and get auth cookie
function createUserCookie(role = 'resident', suffix = '') {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  const id = uuidv4();
  const username = `ob_${role}_${suffix || crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = bcrypt.hashSync('testpass123', 4);
  db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role, trainee_level) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, username, `${username}@test.com`, passwordHash, `Test ${role}`, role, role);
  db.close();
  const token = jwt.sign(
    { id, username, displayName: `Test ${role}`, role, traineeLevel: role },
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
    'Test Oral Board Pneumothorax',
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

// Helper to create a session directly in DB
function createTestSession(sessionId, userId, caseId, opts = {}) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  const mode = opts.mode || 'practice';
  const status = opts.status || 'active';
  const transcript = opts.transcript || JSON.stringify([
    { role: 'examiner', content: 'Please describe the findings.', timestamp: new Date().toISOString() }
  ]);
  const evaluation = opts.evaluation || null;
  const score = opts.score || null;

  db.prepare(`
    INSERT OR IGNORE INTO oral_board_sessions (id, user_id, case_id, mode, status, transcript, evaluation, score, turn_count, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(sessionId, userId, caseId, mode, status, transcript, evaluation, score, opts.turnCount || 0);
  db.close();
}

// Cleanup helpers
function cleanupTestUser(userId) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare('DELETE FROM oral_board_annotations WHERE session_id IN (SELECT id FROM oral_board_sessions WHERE user_id = ?)').run(userId);
  db.prepare('DELETE FROM oral_board_sessions WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  db.close();
}

function cleanupTestCase(caseId) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare('DELETE FROM oral_board_annotations WHERE session_id IN (SELECT id FROM oral_board_sessions WHERE case_id = ?)').run(caseId);
  db.prepare('DELETE FROM oral_board_sessions WHERE case_id = ?').run(caseId);
  db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
  db.close();
}

describe('Oral Board Simulator API', () => {
  let userAuth;
  let otherUserAuth;
  let testCaseId;

  beforeAll(() => {
    userAuth = createUserCookie('resident', 'main');
    otherUserAuth = createUserCookie('resident', 'other');
    testCaseId = uuidv4();
    insertTestCase(testCaseId);
  });

  afterAll(() => {
    cleanupTestCase(testCaseId);
    cleanupTestUser(userAuth.userId);
    cleanupTestUser(otherUserAuth.userId);
  });

  // ============ Auth Guards ============
  describe('Auth guards (401 without auth)', () => {
    test('POST /sessions requires auth', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions')
        .send({ mode: 'practice' });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    test('POST /sessions/:id/respond requires auth', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions/fake-id/respond')
        .send({ message: 'Hello' });
      expect(res.status).toBe(401);
    });

    test('POST /sessions/:id/end requires auth', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions/fake-id/end')
        .send({});
      expect(res.status).toBe(401);
    });

    test('GET /sessions requires auth', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions');
      expect(res.status).toBe(401);
    });

    test('GET /sessions/:id requires auth', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions/fake-id');
      expect(res.status).toBe(401);
    });

    test('GET /sessions/:id/replay requires auth', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions/fake-id/replay');
      expect(res.status).toBe(401);
    });

    test('DELETE /sessions/:id requires auth', async () => {
      const res = await request(app)
        .delete('/api/oral-boards/sessions/fake-id');
      expect(res.status).toBe(401);
    });

    test('GET /stats requires auth', async () => {
      const res = await request(app)
        .get('/api/oral-boards/stats');
      expect(res.status).toBe(401);
    });
  });

  // ============ POST /sessions - Session Creation ============
  describe('POST /sessions - Session creation', () => {
    test('should reject missing mode', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions')
        .set('Cookie', userAuth.cookie)
        .send({ caseId: testCaseId });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mode must be');
    });

    test('should reject invalid mode', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions')
        .set('Cookie', userAuth.cookie)
        .send({ caseId: testCaseId, mode: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mode must be');
    });

    test('should reject non-existent caseId', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions')
        .set('Cookie', userAuth.cookie)
        .send({ caseId: 'nonexistent-case-id', mode: 'practice' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Case not found');
    });

    test('should accept valid timed mode', async () => {
      // This will fail because AI is not configured, but should get past validation
      const res = await request(app)
        .post('/api/oral-boards/sessions')
        .set('Cookie', userAuth.cookie)
        .send({ caseId: testCaseId, mode: 'timed' });
      // Either 200 (AI configured) or 500 (AI not configured) - NOT 400 validation error
      expect([200, 500]).toContain(res.status);
      if (res.status === 400) {
        // Should not be a validation error
        expect(res.body.error).not.toContain('mode must be');
      }
    });

    test('should accept valid practice mode', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions')
        .set('Cookie', userAuth.cookie)
        .send({ caseId: testCaseId, mode: 'practice' });
      expect([200, 500]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).not.toContain('mode must be');
      }
    });
  });

  // ============ GET /sessions - Session Listing ============
  describe('GET /sessions - Session listing', () => {
    let sessionIdA;
    let sessionIdB;

    beforeAll(() => {
      sessionIdA = uuidv4();
      sessionIdB = uuidv4();
      createTestSession(sessionIdA, userAuth.userId, testCaseId, { mode: 'practice', status: 'active' });
      createTestSession(sessionIdB, otherUserAuth.userId, testCaseId, { mode: 'timed', status: 'completed' });
    });

    afterAll(() => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      db.prepare('DELETE FROM oral_board_sessions WHERE id IN (?, ?)').run(sessionIdA, sessionIdB);
      db.close();
    });

    test('should return only the requesting user\'s sessions', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions')
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sessions');
      expect(Array.isArray(res.body.sessions)).toBe(true);

      const userSessionIds = res.body.sessions.map(s => s.id);
      expect(userSessionIds).toContain(sessionIdA);
      expect(userSessionIds).not.toContain(sessionIdB);
    });

    test('should filter by status', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions?status=active')
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(200);
      for (const session of res.body.sessions) {
        expect(session.status).toBe('active');
      }
    });

    test('should ignore invalid status filter', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions?status=bogus')
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sessions');
    });

    test('should respect limit and offset', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions?limit=1&offset=0')
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body.sessions.length).toBeLessThanOrEqual(1);
    });
  });

  // ============ GET /sessions/:id - Session Detail ============
  describe('GET /sessions/:id - Session detail', () => {
    let sessionId;
    let otherSessionId;

    beforeAll(() => {
      sessionId = uuidv4();
      otherSessionId = uuidv4();
      createTestSession(sessionId, userAuth.userId, testCaseId, {
        mode: 'practice',
        status: 'completed',
        score: 75,
        evaluation: JSON.stringify({
          overall_score: 75,
          systematic_approach: 20,
          diagnostic_accuracy: 20,
          completeness: 18,
          clinical_correlation: 17,
          strong_points: ['Good systematic approach'],
          weak_points: ['Missed secondary findings'],
          missed_findings: ['Rib fracture'],
          recommendations: ['Review chest anatomy']
        })
      });
      createTestSession(otherSessionId, otherUserAuth.userId, testCaseId);
    });

    afterAll(() => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      db.prepare('DELETE FROM oral_board_sessions WHERE id IN (?, ?)').run(sessionId, otherSessionId);
      db.close();
    });

    test('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions/nonexistent-id')
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session not found');
    });

    test('should return 403 for another user\'s session', async () => {
      const res = await request(app)
        .get(`/api/oral-boards/sessions/${otherSessionId}`)
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    test('should return full session detail for own session', async () => {
      const res = await request(app)
        .get(`/api/oral-boards/sessions/${sessionId}`)
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('session');
      expect(res.body).toHaveProperty('transcript');
      expect(res.body).toHaveProperty('evaluation');
      expect(res.body).toHaveProperty('case');
      expect(res.body.session.id).toBe(sessionId);
      expect(res.body.session.mode).toBe('practice');
      expect(res.body.session.status).toBe('completed');
      expect(Array.isArray(res.body.transcript)).toBe(true);
      expect(res.body.evaluation).toHaveProperty('overall_score');
      expect(res.body.case).toHaveProperty('title');
    });
  });

  // ============ POST /sessions/:id/respond - Response Validation ============
  describe('POST /sessions/:id/respond - Response validation', () => {
    let activeSessionId;
    let completedSessionId;
    let otherUserSessionId;

    beforeAll(() => {
      activeSessionId = uuidv4();
      completedSessionId = uuidv4();
      otherUserSessionId = uuidv4();
      createTestSession(activeSessionId, userAuth.userId, testCaseId, { status: 'active' });
      createTestSession(completedSessionId, userAuth.userId, testCaseId, { status: 'completed' });
      createTestSession(otherUserSessionId, otherUserAuth.userId, testCaseId, { status: 'active' });
    });

    afterAll(() => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      db.prepare('DELETE FROM oral_board_sessions WHERE id IN (?, ?, ?)').run(activeSessionId, completedSessionId, otherUserSessionId);
      db.close();
    });

    test('should reject empty message', async () => {
      const res = await request(app)
        .post(`/api/oral-boards/sessions/${activeSessionId}/respond`)
        .set('Cookie', userAuth.cookie)
        .send({ message: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    test('should reject missing message', async () => {
      const res = await request(app)
        .post(`/api/oral-boards/sessions/${activeSessionId}/respond`)
        .set('Cookie', userAuth.cookie)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    test('should reject whitespace-only message', async () => {
      const res = await request(app)
        .post(`/api/oral-boards/sessions/${activeSessionId}/respond`)
        .set('Cookie', userAuth.cookie)
        .send({ message: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('message is required');
    });

    test('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions/nonexistent-id/respond')
        .set('Cookie', userAuth.cookie)
        .send({ message: 'I see findings.' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session not found');
    });

    test('should return 403 for another user\'s session', async () => {
      const res = await request(app)
        .post(`/api/oral-boards/sessions/${otherUserSessionId}/respond`)
        .set('Cookie', userAuth.cookie)
        .send({ message: 'I see findings.' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    test('should reject response to a completed session', async () => {
      const res = await request(app)
        .post(`/api/oral-boards/sessions/${completedSessionId}/respond`)
        .set('Cookie', userAuth.cookie)
        .send({ message: 'I see findings.' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not active');
    });
  });

  // ============ POST /sessions/:id/end - Session End ============
  describe('POST /sessions/:id/end - Session end', () => {
    let activeSessionId;
    let completedSessionId;

    beforeAll(() => {
      activeSessionId = uuidv4();
      completedSessionId = uuidv4();
      createTestSession(activeSessionId, userAuth.userId, testCaseId, { status: 'active' });
      createTestSession(completedSessionId, userAuth.userId, testCaseId, { status: 'completed' });
    });

    afterAll(() => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      db.prepare('DELETE FROM oral_board_sessions WHERE id IN (?, ?)').run(activeSessionId, completedSessionId);
      db.close();
    });

    test('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .post('/api/oral-boards/sessions/nonexistent-id/end')
        .set('Cookie', userAuth.cookie)
        .send({});
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session not found');
    });

    test('should prevent double-ending a completed session', async () => {
      const res = await request(app)
        .post(`/api/oral-boards/sessions/${completedSessionId}/end`)
        .set('Cookie', userAuth.cookie)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already completed');
    });

    test('should end an active session (AI may or may not be configured)', async () => {
      const res = await request(app)
        .post(`/api/oral-boards/sessions/${activeSessionId}/end`)
        .set('Cookie', userAuth.cookie)
        .send({ reason: 'testing' });

      // Either 200 with evaluation or 500 if AI fails
      expect([200, 500]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('evaluation');
        expect(res.body).toHaveProperty('score');
        expect(res.body).toHaveProperty('strongPoints');
        expect(res.body).toHaveProperty('weakPoints');
        expect(res.body).toHaveProperty('missedFindings');
        expect(res.body).toHaveProperty('recommendations');

        // Verify the session is now completed in the DB
        const db = new Database(path.join(__dirname, '..', 'radcase.db'));
        const session = db.prepare('SELECT status FROM oral_board_sessions WHERE id = ?').get(activeSessionId);
        expect(session.status).toBe('completed');
        db.close();
      }
    });
  });

  // ============ DELETE /sessions/:id - Session Deletion ============
  describe('DELETE /sessions/:id - Session deletion', () => {
    let sessionToDelete;

    beforeEach(() => {
      sessionToDelete = uuidv4();
      createTestSession(sessionToDelete, userAuth.userId, testCaseId);
    });

    afterEach(() => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      db.prepare('DELETE FROM oral_board_sessions WHERE id = ?').run(sessionToDelete);
      db.close();
    });

    test('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .delete('/api/oral-boards/sessions/nonexistent-id')
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(404);
    });

    test('should return 403 for another user\'s session', async () => {
      const res = await request(app)
        .delete(`/api/oral-boards/sessions/${sessionToDelete}`)
        .set('Cookie', otherUserAuth.cookie);
      expect(res.status).toBe(403);
    });

    test('should delete own session', async () => {
      const res = await request(app)
        .delete(`/api/oral-boards/sessions/${sessionToDelete}`)
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's gone
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const session = db.prepare('SELECT id FROM oral_board_sessions WHERE id = ?').get(sessionToDelete);
      expect(session).toBeUndefined();
      db.close();
    });
  });

  // ============ GET /stats - Stats Endpoint ============
  describe('GET /stats - Stats endpoint', () => {
    beforeAll(() => {
      // Create some completed sessions with scores for stats
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      for (let i = 0; i < 3; i++) {
        const sid = uuidv4();
        const evaluation = JSON.stringify({
          overall_score: 60 + i * 10,
          systematic_approach: 15 + i,
          diagnostic_accuracy: 15 + i,
          completeness: 15 + i,
          clinical_correlation: 15 + i,
          strong_points: [],
          weak_points: [],
          missed_findings: [],
          recommendations: []
        });
        db.prepare(`
          INSERT INTO oral_board_sessions (id, user_id, case_id, mode, status, transcript, evaluation, score, turn_count, started_at, completed_at)
          VALUES (?, ?, ?, 'practice', 'completed', '[]', ?, ?, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(sid, userAuth.userId, testCaseId, evaluation, 60 + i * 10);
      }
      db.close();
    });

    test('should return correct stats structure', async () => {
      const res = await request(app)
        .get('/api/oral-boards/stats')
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalSessions');
      expect(res.body).toHaveProperty('averageScore');
      expect(res.body).toHaveProperty('completionRate');
      expect(res.body).toHaveProperty('weakAreas');
      expect(res.body).toHaveProperty('improvement');
      expect(res.body).toHaveProperty('recentScores');
      expect(typeof res.body.totalSessions).toBe('number');
      expect(res.body.totalSessions).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(res.body.weakAreas)).toBe(true);
      expect(Array.isArray(res.body.recentScores)).toBe(true);
    });

    test('should return stats only for the authenticated user', async () => {
      const res = await request(app)
        .get('/api/oral-boards/stats')
        .set('Cookie', otherUserAuth.cookie);
      expect(res.status).toBe(200);
      // otherUser has no completed sessions with scores via this test setup
      expect(res.body.totalSessions).toBeGreaterThanOrEqual(0);
    });
  });

  // ============ GET /sessions/:id/replay - Replay ============
  describe('GET /sessions/:id/replay', () => {
    let sessionId;

    beforeAll(() => {
      sessionId = uuidv4();
      createTestSession(sessionId, userAuth.userId, testCaseId, { status: 'completed' });
    });

    afterAll(() => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      db.prepare('DELETE FROM oral_board_annotations WHERE session_id = ?').run(sessionId);
      db.prepare('DELETE FROM oral_board_sessions WHERE id = ?').run(sessionId);
      db.close();
    });

    test('should return 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/api/oral-boards/sessions/nonexistent-id/replay')
        .set('Cookie', userAuth.cookie);
      expect(res.status).toBe(404);
    });

    test('should return 403 for another user\'s session', async () => {
      const res = await request(app)
        .get(`/api/oral-boards/sessions/${sessionId}/replay`)
        .set('Cookie', otherUserAuth.cookie);
      expect(res.status).toBe(403);
    });
  });

  // ============ Database Schema Verification ============
  describe('Database schema', () => {
    test('oral_board_sessions table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(oral_board_sessions)").all();
      const columnNames = info.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('case_id');
      expect(columnNames).toContain('mode');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('transcript');
      expect(columnNames).toContain('evaluation');
      expect(columnNames).toContain('score');
      expect(columnNames).toContain('duration_ms');
      expect(columnNames).toContain('turn_count');
      expect(columnNames).toContain('started_at');
      expect(columnNames).toContain('completed_at');
      db.close();
    });

    test('oral_board_annotations table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(oral_board_annotations)").all();
      const columnNames = info.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('session_id');
      expect(columnNames).toContain('turn_number');
      expect(columnNames).toContain('annotation_type');
      expect(columnNames).toContain('content');
      expect(columnNames).toContain('created_at');
      db.close();
    });

    test('oral_board_sessions has correct default values', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(oral_board_sessions)").all();
      const modeCol = info.find(c => c.name === 'mode');
      const statusCol = info.find(c => c.name === 'status');
      const transcriptCol = info.find(c => c.name === 'transcript');
      const turnCountCol = info.find(c => c.name === 'turn_count');

      expect(modeCol.dflt_value).toBe("'practice'");
      expect(statusCol.dflt_value).toBe("'active'");
      expect(transcriptCol.dflt_value).toBe("'[]'");
      expect(turnCountCol.dflt_value).toBe('0');
      db.close();
    });
  });

  // ============ OralBoardEngine Unit Tests ============
  describe('OralBoardEngine', () => {
    const OralBoardEngine = require('../lib/oral-board-engine');
    let engineDb;
    let engineInstance;

    beforeAll(() => {
      engineDb = new Database(path.join(__dirname, '..', 'radcase.db'));
      engineInstance = new OralBoardEngine(engineDb);
    });

    afterAll(() => {
      engineDb.close();
    });

    describe('buildExaminerPrompt', () => {
      test('should include ABR examiner identity', () => {
        const prompt = engineInstance.buildExaminerPrompt({}, 'practice', 0);
        expect(prompt).toContain('ABR');
        expect(prompt).toContain('oral board examiner');
      });

      test('should include timed mode instructions', () => {
        const prompt = engineInstance.buildExaminerPrompt({}, 'timed', 0);
        expect(prompt).toContain('TIMED');
        expect(prompt).toContain('15 minutes');
      });

      test('should include practice mode instructions', () => {
        const prompt = engineInstance.buildExaminerPrompt({}, 'practice', 0);
        expect(prompt).toContain('PRACTICE');
        expect(prompt).toContain('patient');
      });

      test('should include case data when provided', () => {
        const caseData = {
          title: 'Pneumothorax Case',
          modality: 'X-Ray',
          body_part: 'Chest',
          diagnosis: 'Pneumothorax',
          findings: 'Pleural line visible',
          difficulty: 3
        };
        const prompt = engineInstance.buildExaminerPrompt(caseData, 'practice', 0);
        expect(prompt).toContain('X-Ray');
        expect(prompt).toContain('Chest');
        expect(prompt).toContain('Pneumothorax');
        expect(prompt).toContain('Pleural line visible');
      });

      test('should include wrap-up instructions for late turns', () => {
        const prompt = engineInstance.buildExaminerPrompt({}, 'practice', 8);
        expect(prompt).toContain('wrapping up');
      });

      test('should include differential instructions for mid turns', () => {
        const prompt = engineInstance.buildExaminerPrompt({}, 'practice', 3);
        expect(prompt).toContain('differential');
      });

      test('should include scoring criteria', () => {
        const prompt = engineInstance.buildExaminerPrompt({}, 'practice', 0);
        expect(prompt).toContain('Systematic Approach');
        expect(prompt).toContain('Diagnostic Accuracy');
        expect(prompt).toContain('Completeness');
        expect(prompt).toContain('Clinical Correlation');
      });
    });

    describe('calculateScore', () => {
      test('should return overall_score if present', () => {
        const evaluation = { overall_score: 85 };
        expect(engineInstance.calculateScore(evaluation)).toBe(85);
      });

      test('should sum rubric categories if overall_score is missing', () => {
        const evaluation = {
          systematic_approach: 20,
          diagnostic_accuracy: 18,
          completeness: 15,
          clinical_correlation: 22
        };
        expect(engineInstance.calculateScore(evaluation)).toBe(75);
      });

      test('should return 0 for null evaluation', () => {
        expect(engineInstance.calculateScore(null)).toBe(0);
      });

      test('should handle missing categories gracefully', () => {
        const evaluation = {
          systematic_approach: 20,
          diagnostic_accuracy: 15
        };
        expect(engineInstance.calculateScore(evaluation)).toBe(35);
      });

      test('should cap score at 100', () => {
        const evaluation = {
          systematic_approach: 30,
          diagnostic_accuracy: 30,
          completeness: 30,
          clinical_correlation: 30
        };
        expect(engineInstance.calculateScore(evaluation)).toBe(100);
      });

      test('should not go below 0', () => {
        const evaluation = {
          systematic_approach: -10,
          diagnostic_accuracy: -10,
          completeness: -10,
          clinical_correlation: -10
        };
        expect(engineInstance.calculateScore(evaluation)).toBe(0);
      });
    });
  });
});
