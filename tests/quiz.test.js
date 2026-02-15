// Quiz and spaced repetition tests
const request = require('supertest');
const crypto = require('crypto');
const { TEST_USERS, TEST_CASE, registerUser } = require('./setup');

const app = require('../server');

describe('Quiz API', () => {
  let userCookie;
  let quizCaseId;

  beforeAll(async () => {
    userCookie = await registerUser(app, TEST_USERS.resident);

    // Create a case for quiz testing
    const res = await request(app)
      .post('/api/cases')
      .set('Cookie', userCookie)
      .send({
        ...TEST_CASE,
        title: `Quiz Test Case ${crypto.randomBytes(4).toString('hex')}`,
        diagnosis: 'Test Quiz Diagnosis'
      });
    quizCaseId = res.body.id;
  });

  afterAll(async () => {
    if (quizCaseId) {
      await request(app).delete(`/api/cases/${quizCaseId}`).set('Cookie', userCookie);
    }
  });

  describe('GET /api/quiz/random', () => {
    test('should return a random quiz case', async () => {
      const res = await request(app)
        .get('/api/quiz/random')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.diagnosis).toBeDefined();
      expect(res.body.images).toBeDefined();
    });

    test('should respect modality filter', async () => {
      const res = await request(app)
        .get(`/api/quiz/random?modality=${TEST_CASE.modality}`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      if (res.body.id) {
        expect(res.body.modality).toBe(TEST_CASE.modality);
      }
    });

    test('should respect difficulty filter', async () => {
      const res = await request(app)
        .get(`/api/quiz/random?difficulty=${TEST_CASE.difficulty}`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      if (res.body.id) {
        expect(res.body.difficulty).toBe(TEST_CASE.difficulty);
      }
    });

    test('should return 404 when no cases match filter', async () => {
      const res = await request(app)
        .get('/api/quiz/random?modality=NONEXISTENT_MODALITY_XYZ')
        .set('Cookie', userCookie);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No cases found');
    });
  });

  describe('POST /api/quiz/attempt', () => {
    test('should record a correct attempt', async () => {
      const res = await request(app)
        .post('/api/quiz/attempt')
        .set('Cookie', userCookie)
        .send({
          case_id: quizCaseId,
          correct: true,
          time_spent_ms: 15000
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('recorded');
    });

    test('should record an incorrect attempt', async () => {
      const res = await request(app)
        .post('/api/quiz/attempt')
        .set('Cookie', userCookie)
        .send({
          case_id: quizCaseId,
          correct: false,
          time_spent_ms: 25000
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('recorded');
    });

    test('should work without authentication (anonymous attempt)', async () => {
      const res = await request(app)
        .post('/api/quiz/attempt')
        .send({
          case_id: quizCaseId,
          correct: true,
          time_spent_ms: 10000
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('recorded');
    });

    test('should update spaced repetition for authenticated user', async () => {
      // Submit an attempt
      await request(app)
        .post('/api/quiz/attempt')
        .set('Cookie', userCookie)
        .send({
          case_id: quizCaseId,
          correct: true,
          time_spent_ms: 20000
        });

      // Check progress was updated
      const progressRes = await request(app)
        .get('/api/progress')
        .set('Cookie', userCookie);

      expect(progressRes.status).toBe(200);
      expect(progressRes.body.totalAttempts).toBeGreaterThan(0);
    });
  });

  describe('GET /api/quiz/stats', () => {
    test('should return quiz statistics', async () => {
      const res = await request(app)
        .get('/api/quiz/stats')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.overall).toBeDefined();
      expect(res.body.overall.total_attempts).toBeDefined();
      expect(res.body.overall.correct_count).toBeDefined();
      expect(res.body.byDifficulty).toBeDefined();
      expect(Array.isArray(res.body.byDifficulty)).toBe(true);
      expect(res.body.recentMisses).toBeDefined();
      expect(Array.isArray(res.body.recentMisses)).toBe(true);
    });

    test('should return personal stats when authenticated', async () => {
      const res = await request(app)
        .get('/api/quiz/stats')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.isPersonal).toBe(true);
    });

    test('should return global stats when not authenticated', async () => {
      const res = await request(app)
        .get('/api/quiz/stats');

      expect(res.status).toBe(200);
      expect(res.body.isPersonal).toBe(false);
    });
  });

  describe('GET /api/quiz/review/due', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .get('/api/quiz/review/due');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    test('should return due cases for review', async () => {
      const res = await request(app)
        .get('/api/quiz/review/due')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.dueCases).toBeDefined();
      expect(Array.isArray(res.body.dueCases)).toBe(true);
      expect(res.body.newCases).toBeDefined();
      expect(Array.isArray(res.body.newCases)).toBe(true);
      expect(res.body.totalDue).toBeDefined();
      expect(res.body.totalNew).toBeDefined();
    });
  });

  describe('GET /api/quiz/progress (and /api/progress)', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .get('/api/progress');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    test('should return progress summary when authenticated', async () => {
      const res = await request(app)
        .get('/api/progress')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.totalAttempts).toBeDefined();
      expect(res.body.correctCount).toBeDefined();
      expect(res.body.accuracy).toBeDefined();
      expect(res.body.uniqueCases).toBeDefined();
      expect(res.body.masteredCases).toBeDefined();
      expect(res.body.learningCases).toBeDefined();
      expect(res.body.streakData).toBeDefined();
    });
  });

  describe('GET /api/review/due (backwards compat)', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .get('/api/review/due');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    test('should return due cases via backwards compat route', async () => {
      const res = await request(app)
        .get('/api/review/due')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.dueCases).toBeDefined();
      expect(res.body.newCases).toBeDefined();
    });
  });
});
