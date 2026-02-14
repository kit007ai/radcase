// Authentication endpoint tests
const request = require('supertest');
const { cleanupTestFiles, setupTestDirs, TEST_USERS } = require('./setup');

// Import app after setting up environment
const app = require('../server');

describe('Authentication Endpoints', () => {
  beforeAll(() => {
    cleanupTestFiles();
    setupTestDirs();
  });

  afterAll(() => {
    cleanupTestFiles();
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(TEST_USERS.resident);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe(TEST_USERS.resident.username);
      expect(response.headers['set-cookie']).toBeDefined();
    });

    test('should reject registration with missing password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser2',
          email: 'test2@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('password required');
    });

    test('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser3',
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('at least 4 characters');
    });

    test('should reject duplicate username', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'duplicate',
          password: 'password123'
        });

      // Attempt duplicate
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'duplicate',
          password: 'password456'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already taken');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a test user
      await request(app)
        .post('/api/auth/register')
        .send(TEST_USERS.admin);
    });

    test('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: TEST_USERS.admin.username,
          password: TEST_USERS.admin.password
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe(TEST_USERS.admin.username);
      expect(response.headers['set-cookie']).toBeDefined();
    });

    test('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: TEST_USERS.admin.username,
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should reject missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/auth/me', () => {
    let userCookie;

    beforeEach(async () => {
      // Register and login to get auth cookie
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send(TEST_USERS.resident);
      
      userCookie = registerRes.headers['set-cookie'];
    });

    test('should return user info when authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe(TEST_USERS.resident.username);
    });

    test('should return null user when not authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.user).toBeNull();
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'][0]).toContain('token=;');
    });
  });

  describe('JWT Token Validation', () => {
    test('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'token=invalid-token');

      expect(response.status).toBe(200);
      expect(response.body.user).toBeNull();
    });

    test('should handle malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat');

      expect(response.status).toBe(200);
      expect(response.body.user).toBeNull();
    });
  });
});