// Test setup and utilities
const crypto = require('crypto');

// Set test environment before importing app
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

// Generate unique suffix for this test run to avoid DB conflicts
const TEST_RUN_ID = crypto.randomBytes(4).toString('hex');

// Test user data — unique per test run
const TEST_USERS = {
  resident: {
    username: `testuser_${TEST_RUN_ID}`,
    email: `test_${TEST_RUN_ID}@example.com`,
    password: 'testpass123',
    displayName: 'Test User'
  },
  admin: {
    username: `adminuser_${TEST_RUN_ID}`,
    email: `admin_${TEST_RUN_ID}@example.com`,
    password: 'adminpass123',
    displayName: 'Admin User'
  }
};

// Test case data
const TEST_CASE = {
  title: 'Test Case',
  modality: 'CT',
  body_part: 'Chest',
  diagnosis: 'Test Diagnosis',
  difficulty: 3,
  clinical_history: 'Test history',
  teaching_points: 'Test points',
  findings: 'Test findings'
};

// Helper to register a user and return the cookie
async function registerUser(app, userData) {
  const request = require('supertest');
  const res = await request(app)
    .post('/api/auth/register')
    .send(userData);

  if (res.status === 200 && res.headers['set-cookie']) {
    return res.headers['set-cookie'];
  }
  // If registration failed (user exists), try login
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: userData.username, password: userData.password });

  return loginRes.headers['set-cookie'];
}

module.exports = {
  TEST_USERS,
  TEST_CASE,
  TEST_RUN_ID,
  registerUser
};
