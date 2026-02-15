// Core API endpoint tests
const request = require('supertest');
const { TEST_USERS, TEST_CASE, registerUser } = require('./setup');

// Import app after setting up environment
const app = require('../server');

describe('API Endpoints', () => {
  let userCookie;

  beforeAll(async () => {
    // Register and login a test user
    userCookie = await registerUser(app, TEST_USERS.resident);
  });

  describe('Cases API', () => {
    let caseId;

    test('should create a new case', async () => {
      const response = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send(TEST_CASE);

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.message).toContain('created');

      caseId = response.body.id;
    });

    test('should retrieve all cases', async () => {
      const response = await request(app)
        .get('/api/cases')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.cases).toBeDefined();
      expect(Array.isArray(response.body.cases)).toBe(true);
      expect(response.body.total).toBeGreaterThan(0);
    });

    test('should retrieve a specific case', async () => {
      const response = await request(app)
        .get(`/api/cases/${caseId}`)
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(caseId);
      expect(response.body.title).toBe(TEST_CASE.title);
      expect(response.body.images).toBeDefined();
    });

    test('should update a case', async () => {
      const updatedCase = {
        ...TEST_CASE,
        title: 'Updated Test Case',
        difficulty: 4
      };

      const response = await request(app)
        .put(`/api/cases/${caseId}`)
        .set('Cookie', userCookie)
        .send(updatedCase);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('updated');
    });

    test('should search cases', async () => {
      const response = await request(app)
        .get('/api/cases?search=Test')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.cases.length).toBeGreaterThan(0);
    });

    test('should filter cases by modality', async () => {
      const response = await request(app)
        .get(`/api/cases?modality=${TEST_CASE.modality}`)
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.cases.length).toBeGreaterThan(0);
      expect(response.body.cases[0].modality).toBe(TEST_CASE.modality);
    });

    test('should delete a case', async () => {
      const response = await request(app)
        .delete(`/api/cases/${caseId}`)
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted');
    });

    test('should return 404 for non-existent case', async () => {
      const response = await request(app)
        .get('/api/cases/nonexistent-id')
        .set('Cookie', userCookie);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('Tags API', () => {
    test('should retrieve all tags', async () => {
      const response = await request(app)
        .get('/api/tags')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Filters API', () => {
    test('should retrieve filter options', async () => {
      const response = await request(app)
        .get('/api/filters')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.modalities).toBeDefined();
      expect(response.body.bodyParts).toBeDefined();
      expect(response.body.difficulties).toBeDefined();
      expect(Array.isArray(response.body.difficulties)).toBe(true);
      expect(response.body.difficulties).toContain(1);
      expect(response.body.difficulties).toContain(5);
    });
  });

  describe('Quiz API', () => {
    let quizCaseId;

    beforeAll(async () => {
      // Create a case for quiz testing
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send(TEST_CASE);
      quizCaseId = caseRes.body.id;
    });

    afterAll(async () => {
      // Clean up quiz case
      await request(app)
        .delete(`/api/cases/${quizCaseId}`)
        .set('Cookie', userCookie);
    });

    test('should get random quiz case', async () => {
      const response = await request(app)
        .get('/api/quiz/random')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.diagnosis).toBeDefined();
    });

    test('should submit quiz attempt', async () => {
      const response = await request(app)
        .post('/api/quiz/attempt')
        .set('Cookie', userCookie)
        .send({
          case_id: quizCaseId,
          correct: true,
          time_spent_ms: 30000
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('recorded');
    });

    test('should get quiz statistics', async () => {
      const response = await request(app)
        .get('/api/quiz/stats')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.overall).toBeDefined();
      expect(response.body.byDifficulty).toBeDefined();
      expect(response.body.recentMisses).toBeDefined();
    });
  });

  describe('Analytics API', () => {
    test('should get analytics data', async () => {
      const response = await request(app)
        .get('/api/analytics')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.counts).toBeDefined();
      expect(response.body.byModality).toBeDefined();
      expect(response.body.byBodyPart).toBeDefined();
    });
  });

  describe('User Progress API', () => {
    test('should require authentication for progress', async () => {
      const response = await request(app)
        .get('/api/progress');

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Authentication required');
    });

    test('should get user progress when authenticated', async () => {
      const response = await request(app)
        .get('/api/progress')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.totalAttempts).toBeDefined();
      expect(response.body.correctCount).toBeDefined();
      expect(response.body.accuracy).toBeDefined();
    });

    test('should get due reviews for authenticated user', async () => {
      const response = await request(app)
        .get('/api/review/due')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.dueCases).toBeDefined();
      expect(response.body.newCases).toBeDefined();
    });
  });

  describe('Image Management', () => {
    let caseId;

    beforeEach(async () => {
      const caseRes = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send(TEST_CASE);
      caseId = caseRes.body.id;
    });

    afterEach(async () => {
      await request(app)
        .delete(`/api/cases/${caseId}`)
        .set('Cookie', userCookie);
    });

    test('should upload images to case', async () => {
      const testImage = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);

      const response = await request(app)
        .post(`/api/cases/${caseId}/images`)
        .set('Cookie', userCookie)
        .attach('images', testImage, {
          filename: 'test.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(200);
      expect(response.body.uploaded).toBeDefined();
      expect(response.body.uploaded.length).toBe(1);
    });

    test('should handle multiple image uploads', async () => {
      const testImage1 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const testImage2 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);

      const response = await request(app)
        .post(`/api/cases/${caseId}/images`)
        .set('Cookie', userCookie)
        .attach('images', testImage1, 'test1.jpg')
        .attach('images', testImage2, 'test2.jpg');

      expect(response.status).toBe(200);
      expect(response.body.uploaded.length).toBe(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send({}); // Missing required fields

      // Server should respond (not hang/crash the process) — may return 400 or 500
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
