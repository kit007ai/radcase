// Authentication endpoint tests
const request = require('supertest');
const crypto = require('crypto');
const { TEST_USERS, registerUser } = require('./setup');

// Import app after setting up environment
const app = require('../server');

describe('Authentication Endpoints', () => {
  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      // Use a unique username to guarantee fresh registration
      const uniqueUser = {
        username: `newuser_${crypto.randomBytes(4).toString('hex')}`,
        email: `new_${crypto.randomBytes(4).toString('hex')}@example.com`,
        password: 'testpass123',
        displayName: 'New User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(uniqueUser);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe(uniqueUser.username.toLowerCase());
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
          username: `testuser3_${crypto.randomBytes(4).toString('hex')}`,
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('at least 8 characters');
    });

    test('should reject password shorter than 8 characters', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: `testuser_short_${crypto.randomBytes(4).toString('hex')}`,
          password: '1234567'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('at least 8 characters');
    });

    test('should reject duplicate username', async () => {
      const uniqueName = `dup_${crypto.randomBytes(4).toString('hex')}`;

      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          username: uniqueName,
          password: 'password123'
        });

      // Attempt duplicate
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: uniqueName,
          password: 'password456'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already taken');
    });
  });

  describe('POST /api/auth/login', () => {
    let loginUser;

    beforeAll(async () => {
      // Register a unique user for login tests
      loginUser = {
        username: `login_${crypto.randomBytes(4).toString('hex')}`,
        password: 'loginpass123',
        displayName: 'Login Test User'
      };
      await request(app)
        .post('/api/auth/register')
        .send(loginUser);
    });

    test('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: loginUser.username,
          password: loginUser.password
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe(loginUser.username.toLowerCase());
      expect(response.headers['set-cookie']).toBeDefined();
    });

    test('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: loginUser.username,
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

    beforeAll(async () => {
      userCookie = await registerUser(app, TEST_USERS.resident);
    });

    test('should return user info when authenticated', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', userCookie);

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe(TEST_USERS.resident.username.toLowerCase());
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
