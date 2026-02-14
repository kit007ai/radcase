// Test setup and utilities
const fs = require('fs');
const path = require('path');

// Create test database and directories
const TEST_DB_PATH = path.join(__dirname, '..', 'test-radcase.db');
const TEST_UPLOADS_DIR = path.join(__dirname, '..', 'test-uploads');
const TEST_THUMBNAILS_DIR = path.join(__dirname, '..', 'test-thumbnails');
const TEST_DICOM_DIR = path.join(__dirname, '..', 'test-dicom');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DATABASE_PATH = TEST_DB_PATH;

// Clean up test files
function cleanupTestFiles() {
  const testFiles = [TEST_DB_PATH, TEST_UPLOADS_DIR, TEST_THUMBNAILS_DIR, TEST_DICOM_DIR];
  
  testFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      if (fs.statSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
    }
  });
}

// Create test directories
function setupTestDirs() {
  [TEST_UPLOADS_DIR, TEST_THUMBNAILS_DIR, TEST_DICOM_DIR].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

// Test user data
const TEST_USERS = {
  resident: {
    username: 'testuser',
    email: 'test@example.com',
    password: 'testpass123',
    displayName: 'Test User'
  },
  admin: {
    username: 'adminuser',
    email: 'admin@example.com',
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

module.exports = {
  cleanupTestFiles,
  setupTestDirs,
  TEST_USERS,
  TEST_CASE,
  TEST_DB_PATH,
  TEST_UPLOADS_DIR,
  TEST_THUMBNAILS_DIR,
  TEST_DICOM_DIR
};