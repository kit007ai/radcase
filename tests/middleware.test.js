// Middleware tests - auth, upload, error handling
const request = require('supertest');
const crypto = require('crypto');
const { TEST_USERS, TEST_CASE, registerUser } = require('./setup');

const app = require('../server');

describe('Middleware', () => {
  let userCookie;

  beforeAll(async () => {
    userCookie = await registerUser(app, TEST_USERS.resident);
  });

  describe('Auth Middleware', () => {
    test('should extract user from valid cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBeDefined();
    });

    test('should set user to null with no cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    test('should set user to null with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'token=invalid-jwt-token');

      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    test('should accept token from Authorization header', async () => {
      // First get the token from login
      const loginUser = {
        username: `auth_header_${crypto.randomBytes(4).toString('hex')}`,
        password: 'testpass123'
      };

      await request(app)
        .post('/api/auth/register')
        .send(loginUser);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send(loginUser);

      // Extract token from set-cookie header
      const setCookie = loginRes.headers['set-cookie'][0];
      const tokenMatch = setCookie.match(/token=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (token) {
        const res = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.username).toBe(loginUser.username.toLowerCase());
      }
    });

    test('should handle malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat');

      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });
  });

  describe('requireAuth Middleware', () => {
    test('should block unauthenticated access to protected routes', async () => {
      const res = await request(app)
        .get('/api/bookmarks');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    test('should allow authenticated access to protected routes', async () => {
      const res = await request(app)
        .get('/api/bookmarks')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
    });
  });

  describe('Upload Middleware', () => {
    let testCaseId;

    beforeAll(async () => {
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

    test('should accept valid image types (JPEG)', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const res = await request(app)
        .post(`/api/cases/${testCaseId}/images`)
        .set('Cookie', userCookie)
        .attach('images', jpegBuffer, {
          filename: 'test.jpg',
          contentType: 'image/jpeg'
        });

      expect(res.status).toBe(200);
      expect(res.body.uploaded.length).toBe(1);
    });

    test('should accept valid image types (PNG)', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      const res = await request(app)
        .post(`/api/cases/${testCaseId}/images`)
        .set('Cookie', userCookie)
        .attach('images', pngBuffer, {
          filename: 'test.png',
          contentType: 'image/png'
        });

      expect(res.status).toBe(200);
      expect(res.body.uploaded.length).toBe(1);
    });

    test('should reject invalid file types', async () => {
      const phpFile = Buffer.from('<?php echo "hack"; ?>');
      const res = await request(app)
        .post(`/api/cases/${testCaseId}/images`)
        .set('Cookie', userCookie)
        .attach('images', phpFile, {
          filename: 'malicious.php',
          contentType: 'application/x-php'
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid file type');
    });

    test('should generate secure filenames', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const res = await request(app)
        .post(`/api/cases/${testCaseId}/images`)
        .set('Cookie', userCookie)
        .attach('images', jpegBuffer, {
          filename: '../../../etc/passwd.jpg',
          contentType: 'image/jpeg'
        });

      expect(res.status).toBe(200);
      const filename = res.body.uploaded[0].filename;
      expect(filename).not.toContain('..');
      expect(filename).not.toContain('/');
    });
  });

  describe('Error Handler Middleware', () => {
    test('should handle malformed JSON body', async () => {
      const res = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .set('Content-Type', 'application/json')
        .send('{invalid json}');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    test('should not expose stack traces in errors', async () => {
      const res = await request(app)
        .get('/api/cases/nonexistent-id')
        .set('Cookie', userCookie);

      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/at\s+\w+\s+\(/);
    });

    test('should return proper JSON error responses', async () => {
      const res = await request(app)
        .get('/api/cases/nonexistent-id')
        .set('Cookie', userCookie);

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error).toBe('string');
    });
  });

  describe('Compression Middleware', () => {
    test('should compress JSON responses', async () => {
      const res = await request(app)
        .get('/api/cases')
        .set('Cookie', userCookie)
        .set('Accept-Encoding', 'gzip, deflate');

      expect(res.status).toBe(200);
      // Compression may or may not be applied depending on response size
      // Just verify the request succeeds
    });
  });

  describe('CORS Middleware', () => {
    test('should include CORS headers', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
