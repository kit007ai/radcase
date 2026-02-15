// Sync, bookmarks, push, and session tests
const request = require('supertest');
const crypto = require('crypto');
const { TEST_USERS, TEST_CASE, registerUser } = require('./setup');

const app = require('../server');

describe('Sync & Bookmarks API', () => {
  let userCookie;
  let testCaseId;

  beforeAll(async () => {
    userCookie = await registerUser(app, TEST_USERS.resident);

    // Create a case for bookmark/annotation testing
    const res = await request(app)
      .post('/api/cases')
      .set('Cookie', userCookie)
      .send({
        ...TEST_CASE,
        title: `Sync Test Case ${crypto.randomBytes(4).toString('hex')}`
      });
    testCaseId = res.body.id;
  });

  afterAll(async () => {
    if (testCaseId) {
      await request(app).delete(`/api/cases/${testCaseId}`).set('Cookie', userCookie);
    }
  });

  describe('GET /api/push/vapid-key', () => {
    test('should return VAPID public key', async () => {
      const res = await request(app)
        .get('/api/push/vapid-key');

      expect(res.status).toBe(200);
      expect(res.body.publicKey).toBeDefined();
      expect(typeof res.body.publicKey).toBe('string');
      expect(res.body.publicKey.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/push-subscription', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .post('/api/push-subscription')
        .send({
          subscription: {
            endpoint: 'https://example.com/push',
            keys: { p256dh: 'testkey', auth: 'testauthkey' }
          }
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    test('should save push subscription', async () => {
      const uniqueEndpoint = `https://example.com/push/${crypto.randomBytes(8).toString('hex')}`;
      const res = await request(app)
        .post('/api/push-subscription')
        .set('Cookie', userCookie)
        .send({
          subscription: {
            endpoint: uniqueEndpoint,
            keys: { p256dh: 'testkey123', auth: 'testauthkey123' }
          },
          userAgent: 'test-agent'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should reject invalid subscription data', async () => {
      const res = await request(app)
        .post('/api/push-subscription')
        .set('Cookie', userCookie)
        .send({ subscription: {} });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test('should reject subscription without keys', async () => {
      const res = await request(app)
        .post('/api/push-subscription')
        .set('Cookie', userCookie)
        .send({
          subscription: {
            endpoint: 'https://example.com/push',
            keys: {}
          }
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/annotations', () => {
    test('should save annotations', async () => {
      // First, upload an image to get an image_id
      const testImage = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const uploadRes = await request(app)
        .post(`/api/cases/${testCaseId}/images`)
        .set('Cookie', userCookie)
        .attach('images', testImage, {
          filename: 'annotate-test.jpg',
          contentType: 'image/jpeg'
        });

      const imageId = uploadRes.body.uploaded[0].id;

      const res = await request(app)
        .post('/api/annotations')
        .set('Cookie', userCookie)
        .send({
          image_id: imageId,
          case_id: testCaseId,
          annotations: [{ type: 'arrow', x: 100, y: 200 }]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should reject annotations without image_id', async () => {
      const res = await request(app)
        .post('/api/annotations')
        .set('Cookie', userCookie)
        .send({
          annotations: [{ type: 'arrow', x: 100, y: 200 }]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('image_id');
    });

    test('should reject annotations without annotations data', async () => {
      const res = await request(app)
        .post('/api/annotations')
        .set('Cookie', userCookie)
        .send({
          image_id: 'some-id'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('annotations');
    });
  });

  describe('Bookmarks API', () => {
    describe('GET /api/bookmarks', () => {
      test('should require authentication', async () => {
        const res = await request(app)
          .get('/api/bookmarks');

        expect(res.status).toBe(401);
        expect(res.body.error).toContain('Authentication required');
      });

      test('should return bookmarks list', async () => {
        const res = await request(app)
          .get('/api/bookmarks')
          .set('Cookie', userCookie);

        expect(res.status).toBe(200);
        expect(res.body.bookmarks).toBeDefined();
        expect(Array.isArray(res.body.bookmarks)).toBe(true);
      });
    });

    describe('POST /api/bookmarks', () => {
      test('should require authentication', async () => {
        const res = await request(app)
          .post('/api/bookmarks')
          .send({ case_id: testCaseId });

        expect(res.status).toBe(401);
      });

      test('should create a bookmark', async () => {
        const res = await request(app)
          .post('/api/bookmarks')
          .set('Cookie', userCookie)
          .send({ case_id: testCaseId });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      test('should reject bookmark without case_id', async () => {
        const res = await request(app)
          .post('/api/bookmarks')
          .set('Cookie', userCookie)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('case_id');
      });

      test('should handle duplicate bookmarks gracefully', async () => {
        // Bookmark same case again (INSERT OR IGNORE)
        const res = await request(app)
          .post('/api/bookmarks')
          .set('Cookie', userCookie)
          .send({ case_id: testCaseId });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    });

    describe('DELETE /api/bookmarks/:caseId', () => {
      test('should require authentication', async () => {
        const res = await request(app)
          .delete(`/api/bookmarks/${testCaseId}`);

        expect(res.status).toBe(401);
      });

      test('should remove a bookmark', async () => {
        // Ensure bookmark exists first
        await request(app)
          .post('/api/bookmarks')
          .set('Cookie', userCookie)
          .send({ case_id: testCaseId });

        const res = await request(app)
          .delete(`/api/bookmarks/${testCaseId}`)
          .set('Cookie', userCookie);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify it's removed
        const listRes = await request(app)
          .get('/api/bookmarks')
          .set('Cookie', userCookie);

        const found = listRes.body.bookmarks.find(b => b.case_id === testCaseId);
        expect(found).toBeUndefined();
      });
    });
  });

  describe('Session API', () => {
    describe('GET /api/session/active', () => {
      test('should require authentication', async () => {
        const res = await request(app)
          .get('/api/session/active');

        expect(res.status).toBe(401);
      });

      test('should return null session when none exists', async () => {
        // Clear any existing session first
        await request(app)
          .delete('/api/session/active')
          .set('Cookie', userCookie);

        const res = await request(app)
          .get('/api/session/active')
          .set('Cookie', userCookie);

        expect(res.status).toBe(200);
        expect(res.body.session).toBeNull();
      });
    });

    describe('PUT /api/session/active', () => {
      test('should require authentication', async () => {
        const res = await request(app)
          .put('/api/session/active')
          .send({ state: { currentCase: 1 } });

        expect(res.status).toBe(401);
      });

      test('should save a session state', async () => {
        const sessionState = {
          currentCase: 0,
          cases: ['case1', 'case2'],
          score: 5
        };

        const res = await request(app)
          .put('/api/session/active')
          .set('Cookie', userCookie)
          .send({ state: sessionState, deviceId: 'test-device' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify session was saved
        const getRes = await request(app)
          .get('/api/session/active')
          .set('Cookie', userCookie);

        expect(getRes.status).toBe(200);
        expect(getRes.body.session).toBeDefined();
        expect(getRes.body.session.score).toBe(5);
        expect(getRes.body.deviceId).toBe('test-device');
      });

      test('should reject when state is missing', async () => {
        const res = await request(app)
          .put('/api/session/active')
          .set('Cookie', userCookie)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('state');
      });
    });

    describe('DELETE /api/session/active', () => {
      test('should require authentication', async () => {
        const res = await request(app)
          .delete('/api/session/active');

        expect(res.status).toBe(401);
      });

      test('should delete the active session', async () => {
        // Create a session
        await request(app)
          .put('/api/session/active')
          .set('Cookie', userCookie)
          .send({ state: { test: true } });

        // Delete it
        const res = await request(app)
          .delete('/api/session/active')
          .set('Cookie', userCookie);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify deleted
        const getRes = await request(app)
          .get('/api/session/active')
          .set('Cookie', userCookie);

        expect(getRes.body.session).toBeNull();
      });
    });
  });

  describe('POST /api/progress (sync endpoint)', () => {
    test('should sync progress data', async () => {
      const res = await request(app)
        .post('/api/progress')
        .set('Cookie', userCookie)
        .send({
          case_id: testCaseId,
          event: 'answer_submitted',
          data: { correct: true, time_spent_ms: 5000 }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should reject progress without case_id or sessionId', async () => {
      const res = await request(app)
        .post('/api/progress')
        .set('Cookie', userCookie)
        .send({ event: 'answer_submitted' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/sync/token', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .get('/api/sync/token');

      expect(res.status).toBe(401);
    });

    test('should return a sync token', async () => {
      const res = await request(app)
        .get('/api/sync/token')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
    });
  });

  describe('GET /api/sync/events', () => {
    test('should require authentication', async () => {
      const res = await request(app)
        .get('/api/sync/events');

      expect(res.status).toBe(401);
    });

    test('should return sync events', async () => {
      const res = await request(app)
        .get('/api/sync/events')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.events).toBeDefined();
      expect(Array.isArray(res.body.events)).toBe(true);
    });
  });
});
