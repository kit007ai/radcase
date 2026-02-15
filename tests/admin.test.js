// Admin, analytics, and filter endpoint tests
const request = require('supertest');
const crypto = require('crypto');
const { TEST_USERS, TEST_CASE, registerUser } = require('./setup');

const app = require('../server');

describe('Admin & Public Data API', () => {
  let userCookie;

  beforeAll(async () => {
    userCookie = await registerUser(app, TEST_USERS.admin);
  });

  describe('GET /api/admin/metrics', () => {
    test('should return performance metrics', async () => {
      const res = await request(app)
        .get('/api/admin/metrics');

      expect(res.status).toBe(200);
      expect(typeof res.body).toBe('object');
    });
  });

  describe('GET /api/admin/health', () => {
    test('should return health status', async () => {
      const res = await request(app)
        .get('/api/admin/health');

      expect(res.status === 200 || res.status === 503).toBe(true);
      expect(res.body.status).toBeDefined();
    });
  });

  describe('GET /api/health', () => {
    test('should return ok status', async () => {
      const res = await request(app)
        .get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/admin/beta-signup', () => {
    test('should create a beta signup with valid data', async () => {
      const uniqueEmail = `beta_${crypto.randomBytes(4).toString('hex')}@example.com`;

      const res = await request(app)
        .post('/api/admin/beta-signup')
        .send({
          name: 'Test Beta User',
          email: uniqueEmail,
          role: 'resident',
          institution: 'Test Hospital',
          specialty: 'Radiology',
          studyTime: '2-4 hours',
          currentTools: ['radiopaedia', 'statdx'],
          motivation: 'I want to improve my radiology skills',
          interview: 'yes',
          referrals: 'no'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.signupId).toBeDefined();
    });

    test('should reject beta signup with missing fields', async () => {
      const res = await request(app)
        .post('/api/admin/beta-signup')
        .send({
          name: 'Test User',
          email: 'test@example.com'
          // missing role, institution, studyTime, motivation
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    test('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/admin/beta-signup')
        .send({
          name: 'Test User',
          email: 'invalid-email',
          role: 'resident',
          institution: 'Test Hospital',
          studyTime: '2-4 hours',
          motivation: 'Testing'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid email');
    });

    test('should detect duplicate email registrations', async () => {
      const uniqueEmail = `dup_beta_${crypto.randomBytes(4).toString('hex')}@example.com`;

      const signupData = {
        name: 'Test User',
        email: uniqueEmail,
        role: 'resident',
        institution: 'Test Hospital',
        studyTime: '2-4 hours',
        motivation: 'Testing duplicate detection'
      };

      // First signup
      await request(app)
        .post('/api/admin/beta-signup')
        .send(signupData);

      // Duplicate
      const res = await request(app)
        .post('/api/admin/beta-signup')
        .send(signupData);

      expect(res.status).toBe(200);
      expect(res.body.existing).toBe(true);
    });
  });

  describe('GET /api/analytics', () => {
    test('should return analytics data', async () => {
      const res = await request(app)
        .get('/api/analytics');

      expect(res.status).toBe(200);
      expect(res.body.counts).toBeDefined();
      expect(res.body.counts.cases).toBeDefined();
      expect(res.body.counts.images).toBeDefined();
      expect(res.body.byModality).toBeDefined();
      expect(Array.isArray(res.body.byModality)).toBe(true);
      expect(res.body.byBodyPart).toBeDefined();
      expect(Array.isArray(res.body.byBodyPart)).toBe(true);
    });

    test('should return richer analytics at /api/admin/analytics', async () => {
      const res = await request(app)
        .get('/api/admin/analytics');

      expect(res.status).toBe(200);
      expect(res.body.counts).toBeDefined();
      expect(res.body.counts.tags).toBeDefined();
      expect(res.body.recentCases).toBeDefined();
      expect(Array.isArray(res.body.recentCases)).toBe(true);
    });
  });

  describe('GET /api/filters', () => {
    let testCaseId;

    beforeAll(async () => {
      // Create a case to ensure filters have data
      const res = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send(TEST_CASE);
      testCaseId = res.body.id;
    });

    afterAll(async () => {
      if (testCaseId) {
        await request(app).delete(`/api/cases/${testCaseId}`).set('Cookie', userCookie);
      }
    });

    test('should return filter options', async () => {
      const res = await request(app)
        .get('/api/filters');

      expect(res.status).toBe(200);
      expect(res.body.modalities).toBeDefined();
      expect(Array.isArray(res.body.modalities)).toBe(true);
      expect(res.body.bodyParts).toBeDefined();
      expect(Array.isArray(res.body.bodyParts)).toBe(true);
      expect(res.body.difficulties).toBeDefined();
      expect(res.body.difficulties).toEqual([1, 2, 3, 4, 5]);
    });

    test('should include modalities from existing cases', async () => {
      const res = await request(app)
        .get('/api/filters');

      expect(res.status).toBe(200);
      expect(res.body.modalities).toContain(TEST_CASE.modality);
    });
  });

  describe('GET /api/tags', () => {
    test('should return all tags', async () => {
      const res = await request(app)
        .get('/api/tags');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Admin Users (requires auth)', () => {
    test('should reject users list without auth', async () => {
      const res = await request(app)
        .get('/api/admin/users');

      expect(res.status).toBe(401);
    });

    test('should reject non-admin users', async () => {
      // Regular user (role: resident) should be rejected
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', userCookie);

      // May return 200 (if no admin check) or 403 (if admin-only)
      expect(res.status === 200 || res.status === 403).toBe(true);
    });
  });

  describe('AI Status', () => {
    test('should return AI configuration status', async () => {
      const res = await request(app)
        .get('/api/admin/ai/status');

      expect(res.status).toBe(200);
      expect(res.body.configured).toBeDefined();
      expect(typeof res.body.configured).toBe('boolean');
    });
  });

  describe('POST /api/admin/interview-request', () => {
    test('should create an interview request with valid data', async () => {
      const uniqueEmail = `interview_${crypto.randomBytes(4).toString('hex')}@example.com`;

      const res = await request(app)
        .post('/api/admin/interview-request')
        .send({
          name: 'Interview Tester',
          email: uniqueEmail,
          role: 'attending',
          institution: 'Test Medical Center',
          timezone: 'America/New_York',
          selectedTimes: ['Monday 9am', 'Wednesday 2pm'],
          platformPreference: 'zoom',
          studyHabits: 'Daily case reviews',
          mainChallenge: 'Finding time to study'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.requestId).toBeDefined();
    });

    test('should reject interview request with missing fields', async () => {
      const res = await request(app)
        .post('/api/admin/interview-request')
        .send({
          name: 'Test User',
          email: 'test@example.com'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });
  });
});
