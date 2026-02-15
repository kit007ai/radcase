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

// Small delay helper for rate limit backoff
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to register a user and return the cookie
// Retries on rate-limit (429) responses
async function registerUser(app, userData) {
  const request = require('supertest');

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(1100); // Wait past rate-limit window

    const res = await request(app)
      .post('/api/auth/register')
      .send(userData);

    if (res.status === 200 && res.headers['set-cookie']) {
      return res.headers['set-cookie'];
    }

    // If registration failed (user exists or rate limited), try login
    if (res.status === 429) continue; // Rate limited, retry after delay

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: userData.username, password: userData.password });

    if (loginRes.status === 200 && loginRes.headers['set-cookie']) {
      return loginRes.headers['set-cookie'];
    }
    if (loginRes.status === 429) continue; // Rate limited, retry
  }

  // Last resort: create user directly in DB and generate JWT
  const path = require('path');
  const Database = require('better-sqlite3');
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';

  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  let dbUser = db.prepare('SELECT id, username, display_name, role FROM users WHERE username = ?').get(userData.username.toLowerCase());

  if (!dbUser) {
    // User doesn't exist yet - insert directly
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(userData.password, 4); // low rounds for speed
    db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name) VALUES (?, ?, ?, ?, ?)')
      .run(id, userData.username.toLowerCase(), userData.email || null, passwordHash, userData.displayName || userData.username);
    dbUser = { id, username: userData.username.toLowerCase(), display_name: userData.displayName || userData.username, role: 'resident' };
  }

  db.close();

  const token = jwt.sign(
    { id: dbUser.id, username: dbUser.username, displayName: dbUser.display_name || dbUser.username, role: dbUser.role || 'resident' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return [`token=${token}; Path=/; HttpOnly`];
}

module.exports = {
  TEST_USERS,
  TEST_CASE,
  TEST_RUN_ID,
  registerUser
};
