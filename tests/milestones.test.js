const request = require('supertest');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Ensure test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET;
const TEST_SUFFIX = crypto.randomBytes(4).toString('hex');

// Helper to create a user and get auth cookie
function createUserCookie(role = 'resident', suffix = '') {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  const id = uuidv4();
  const username = `ms_${role}_${suffix || crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = bcrypt.hashSync('testpass123', 4);
  db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role, trainee_level) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, username, `${username}@test.com`, passwordHash, `Test ${role}`, role, role === 'admin' ? 'attending' : role);
  db.close();
  const token = jwt.sign(
    { id, username, displayName: `Test ${role}`, role, traineeLevel: role === 'admin' ? 'attending' : role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { cookie: [`token=${token}; Path=/; HttpOnly`], userId: id, username };
}

// Helper to insert a test case
function insertTestCase(id, opts = {}) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare(`INSERT OR IGNORE INTO cases (id, title, modality, body_part, diagnosis, difficulty, clinical_history, teaching_points, findings, differentials)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    opts.title || 'Test Milestone Case',
    opts.modality || 'CT',
    opts.body_part || 'Chest',
    opts.diagnosis || 'Test Diagnosis',
    opts.difficulty || 3,
    opts.clinical_history || 'Test clinical history',
    opts.teaching_points || 'Test teaching points',
    opts.findings || 'Test findings',
    opts.differentials || JSON.stringify(['Diagnosis A', 'Diagnosis B'])
  );
  db.close();
}

// Cleanup helpers
function cleanupUser(userId) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare('DELETE FROM milestone_assessments WHERE user_id = ? OR assessor_id = ?').run(userId, userId);
  db.prepare('DELETE FROM milestone_progress WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM cme_credits WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM program_members WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM quiz_attempts WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM differential_attempts WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  db.close();
}

function cleanupProgram(programId) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare('DELETE FROM cohort_snapshots WHERE program_id = ?').run(programId);
  db.prepare('DELETE FROM program_members WHERE program_id = ?').run(programId);
  db.prepare('DELETE FROM programs WHERE id = ?').run(programId);
  db.close();
}

function cleanupInstitution(instId) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  // Cascade: programs -> program_members
  const programs = db.prepare('SELECT id FROM programs WHERE institution_id = ?').all(instId);
  for (const p of programs) {
    db.prepare('DELETE FROM cohort_snapshots WHERE program_id = ?').run(p.id);
    db.prepare('DELETE FROM program_members WHERE program_id = ?').run(p.id);
  }
  db.prepare('DELETE FROM programs WHERE institution_id = ?').run(instId);
  db.prepare('DELETE FROM institutions WHERE id = ?').run(instId);
  db.close();
}

function cleanupCase(caseId) {
  const db = new Database(path.join(__dirname, '..', 'radcase.db'));
  db.prepare('DELETE FROM case_milestones WHERE case_id = ?').run(caseId);
  db.prepare('DELETE FROM quiz_attempts WHERE case_id = ?').run(caseId);
  db.prepare('DELETE FROM differential_attempts WHERE case_id = ?').run(caseId);
  db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
  db.close();
}

describe('Phase 5: Milestones, Programs, CME', () => {
  let residentAuth, attendingAuth, adminAuth;
  let testCaseId;
  let institutionId, programId;

  beforeAll(() => {
    residentAuth = createUserCookie('resident', `res_${TEST_SUFFIX}`);
    attendingAuth = createUserCookie('attending', `att_${TEST_SUFFIX}`);
    adminAuth = createUserCookie('admin', `adm_${TEST_SUFFIX}`);
    testCaseId = uuidv4();
    insertTestCase(testCaseId);
  });

  afterAll(() => {
    cleanupCase(testCaseId);
    // Clean up institution/program if created
    if (institutionId) cleanupInstitution(institutionId);
    cleanupUser(residentAuth.userId);
    cleanupUser(attendingAuth.userId);
    cleanupUser(adminAuth.userId);
  });

  // ============ Database Schema Verification ============
  describe('Database schema', () => {
    test('institutions table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(institutions)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('id');
      expect(cols).toContain('name');
      expect(cols).toContain('type');
      expect(cols).toContain('settings');
      db.close();
    });

    test('programs table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(programs)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('id');
      expect(cols).toContain('institution_id');
      expect(cols).toContain('name');
      expect(cols).toContain('specialty');
      expect(cols).toContain('accreditation_id');
      db.close();
    });

    test('program_members table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(program_members)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('program_id');
      expect(cols).toContain('user_id');
      expect(cols).toContain('role');
      expect(cols).toContain('pgy_year');
      expect(cols).toContain('status');
      db.close();
    });

    test('acgme_milestones table exists with correct columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(acgme_milestones)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('id');
      expect(cols).toContain('domain');
      expect(cols).toContain('subdomain');
      expect(cols).toContain('level_descriptions');
      expect(cols).toContain('body_parts');
      expect(cols).toContain('modalities');
      db.close();
    });

    test('milestone_progress table exists', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(milestone_progress)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('user_id');
      expect(cols).toContain('milestone_id');
      expect(cols).toContain('current_level');
      expect(cols).toContain('evidence');
      db.close();
    });

    test('milestone_assessments table exists', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(milestone_assessments)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('user_id');
      expect(cols).toContain('milestone_id');
      expect(cols).toContain('assessor_id');
      expect(cols).toContain('level');
      expect(cols).toContain('evidence_type');
      db.close();
    });

    test('cme_credits table exists', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(cme_credits)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('user_id');
      expect(cols).toContain('activity_type');
      expect(cols).toContain('credits');
      expect(cols).toContain('category');
      db.close();
    });

    test('cohort_snapshots table exists', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(cohort_snapshots)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('program_id');
      expect(cols).toContain('snapshot_date');
      expect(cols).toContain('pgy_year');
      expect(cols).toContain('metric_type');
      expect(cols).toContain('percentiles');
      db.close();
    });

    test('case_milestones table exists', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(case_milestones)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('case_id');
      expect(cols).toContain('milestone_id');
      expect(cols).toContain('relevance_score');
      db.close();
    });

    test('users table has new columns', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(users)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('institution_id');
      expect(cols).toContain('program_id');
      expect(cols).toContain('pgy_year');
      db.close();
    });

    test('cases table has acgme_domains column', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const info = db.prepare("PRAGMA table_info(cases)").all();
      const cols = info.map(c => c.name);
      expect(cols).toContain('acgme_domains');
      db.close();
    });
  });

  // ============ ACGME Milestone Seeding ============
  describe('ACGME Milestone Seeding', () => {
    test('should have seeded 15 milestones', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const count = db.prepare('SELECT COUNT(*) as count FROM acgme_milestones').get();
      expect(count.count).toBe(15);
      db.close();
    });

    test('should have all 6 domains', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const domains = db.prepare('SELECT DISTINCT domain FROM acgme_milestones ORDER BY domain').all();
      const domainNames = domains.map(d => d.domain);
      expect(domainNames).toContain('patient_care');
      expect(domainNames).toContain('medical_knowledge');
      expect(domainNames).toContain('systems_based_practice');
      expect(domainNames).toContain('practice_based_learning');
      expect(domainNames).toContain('professionalism');
      expect(domainNames).toContain('interpersonal_communication');
      expect(domains.length).toBe(6);
      db.close();
    });

    test('each milestone has valid level_descriptions JSON', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const milestones = db.prepare('SELECT id, level_descriptions FROM acgme_milestones').all();
      for (const m of milestones) {
        const descriptions = JSON.parse(m.level_descriptions);
        expect(descriptions).toHaveProperty('1');
        expect(descriptions).toHaveProperty('2');
        expect(descriptions).toHaveProperty('3');
        expect(descriptions).toHaveProperty('4');
        expect(descriptions).toHaveProperty('5');
      }
      db.close();
    });

    test('milestones have correct IDs', () => {
      const db = new Database(path.join(__dirname, '..', 'radcase.db'));
      const ids = db.prepare('SELECT id FROM acgme_milestones ORDER BY id').all().map(m => m.id);
      expect(ids).toContain('DR-PC1');
      expect(ids).toContain('DR-PC2');
      expect(ids).toContain('DR-PC3');
      expect(ids).toContain('DR-MK1');
      expect(ids).toContain('DR-MK2');
      expect(ids).toContain('DR-SBP1');
      expect(ids).toContain('DR-SBP2');
      expect(ids).toContain('DR-SBP3');
      expect(ids).toContain('DR-PBLI1');
      expect(ids).toContain('DR-PBLI2');
      expect(ids).toContain('DR-PROF1');
      expect(ids).toContain('DR-PROF2');
      expect(ids).toContain('DR-ICS1');
      expect(ids).toContain('DR-ICS2');
      expect(ids).toContain('DR-ICS3');
      db.close();
    });
  });

  // ============ Milestone API Auth Guards ============
  describe('Milestone API - Auth guards', () => {
    test('GET /api/milestones requires auth', async () => {
      const res = await request(app).get('/api/milestones');
      expect(res.status).toBe(401);
    });

    test('GET /api/milestones/:id requires auth', async () => {
      const res = await request(app).get('/api/milestones/DR-PC1');
      expect(res.status).toBe(401);
    });

    test('POST /api/milestones/recalculate requires auth', async () => {
      const res = await request(app).post('/api/milestones/recalculate');
      expect(res.status).toBe(401);
    });

    test('GET /api/milestones/gaps requires auth', async () => {
      const res = await request(app).get('/api/milestones/gaps');
      expect(res.status).toBe(401);
    });

    test('POST /api/milestones/assess requires auth', async () => {
      const res = await request(app).post('/api/milestones/assess').send({});
      expect(res.status).toBe(401);
    });

    test('POST /api/milestones/cases/:caseId/auto-tag requires auth', async () => {
      const res = await request(app).post(`/api/milestones/cases/${testCaseId}/auto-tag`);
      expect(res.status).toBe(401);
    });
  });

  // ============ Milestone API Endpoints ============
  describe('Milestone API - Endpoints', () => {
    test('GET /api/milestones returns progress summary', async () => {
      const res = await request(app)
        .get('/api/milestones')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('overallLevel');
      expect(res.body).toHaveProperty('domains');
      expect(res.body).toHaveProperty('totalMilestones');
      expect(Array.isArray(res.body.domains)).toBe(true);
      expect(res.body.totalMilestones).toBe(15);
    });

    test('GET /api/milestones/:id returns milestone detail', async () => {
      const res = await request(app)
        .get('/api/milestones/DR-PC1')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('milestone');
      expect(res.body.milestone.id).toBe('DR-PC1');
      expect(res.body.milestone.domain).toBe('patient_care');
      expect(res.body.milestone).toHaveProperty('level_descriptions');
      expect(res.body.milestone.level_descriptions).toHaveProperty('1');
    });

    test('GET /api/milestones/:id returns 404 for invalid milestone', async () => {
      const res = await request(app)
        .get('/api/milestones/INVALID')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(404);
    });

    test('POST /api/milestones/recalculate recalculates all milestones', async () => {
      const res = await request(app)
        .post('/api/milestones/recalculate')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('milestones');
      expect(Array.isArray(res.body.milestones)).toBe(true);
    });

    test('GET /api/milestones/gaps returns gap analysis', async () => {
      const res = await request(app)
        .get('/api/milestones/gaps')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('expectedLevel');
      expect(res.body).toHaveProperty('gaps');
      expect(Array.isArray(res.body.gaps)).toBe(true);
    });

    test('GET /api/milestones/cases/:caseId/milestones returns case milestones (no auth required)', async () => {
      const res = await request(app)
        .get(`/api/milestones/cases/${testCaseId}/milestones`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('caseId');
      expect(res.body).toHaveProperty('milestones');
    });
  });

  // ============ Case Auto-Tagging ============
  describe('Case Auto-Tagging', () => {
    test('POST /api/milestones/cases/:caseId/auto-tag tags case to milestones', async () => {
      const res = await request(app)
        .post(`/api/milestones/cases/${testCaseId}/auto-tag`)
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('tags');
      expect(Array.isArray(res.body.tags)).toBe(true);
      expect(res.body.tags.length).toBeGreaterThan(0);
      // Should include DR-PC2 (Image Interpretation) since it matches all
      const pc2 = res.body.tags.find(t => t.milestoneId === 'DR-PC2');
      expect(pc2).toBeDefined();
      expect(pc2.relevance).toBe(1.0);
    });

    test('auto-tag returns 404 for non-existent case', async () => {
      const res = await request(app)
        .post('/api/milestones/cases/nonexistent-case/auto-tag')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(404);
    });

    test('milestones appear in case milestones after tagging', async () => {
      const res = await request(app)
        .get(`/api/milestones/cases/${testCaseId}/milestones`);
      expect(res.status).toBe(200);
      expect(res.body.milestones.length).toBeGreaterThan(0);
    });
  });

  // ============ Faculty Assessment ============
  describe('Faculty Assessment', () => {
    test('resident cannot assess', async () => {
      const res = await request(app)
        .post('/api/milestones/assess')
        .set('Cookie', residentAuth.cookie)
        .send({ userId: residentAuth.userId, milestoneId: 'DR-PC1', level: 3 });
      expect(res.status).toBe(403);
    });

    test('attending can assess', async () => {
      const res = await request(app)
        .post('/api/milestones/assess')
        .set('Cookie', attendingAuth.cookie)
        .send({ userId: residentAuth.userId, milestoneId: 'DR-PC1', level: 3, notes: 'Good progress' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.assessment.level).toBe(3);
    });

    test('assess rejects invalid level', async () => {
      const res = await request(app)
        .post('/api/milestones/assess')
        .set('Cookie', attendingAuth.cookie)
        .send({ userId: residentAuth.userId, milestoneId: 'DR-PC1', level: 6 });
      expect(res.status).toBe(400);
    });

    test('assess rejects missing fields', async () => {
      const res = await request(app)
        .post('/api/milestones/assess')
        .set('Cookie', attendingAuth.cookie)
        .send({ userId: residentAuth.userId });
      expect(res.status).toBe(400);
    });

    test('assess rejects non-existent milestone', async () => {
      const res = await request(app)
        .post('/api/milestones/assess')
        .set('Cookie', attendingAuth.cookie)
        .send({ userId: residentAuth.userId, milestoneId: 'INVALID', level: 3 });
      expect(res.status).toBe(404);
    });

    test('assess rejects non-existent user', async () => {
      const res = await request(app)
        .post('/api/milestones/assess')
        .set('Cookie', attendingAuth.cookie)
        .send({ userId: 'nonexistent-user', milestoneId: 'DR-PC1', level: 3 });
      expect(res.status).toBe(404);
    });
  });

  // ============ Programs API ============
  describe('Programs API', () => {
    // ---- Institutions ----
    describe('Institutions', () => {
      test('POST /api/programs/institutions requires admin', async () => {
        const res = await request(app)
          .post('/api/programs/institutions')
          .set('Cookie', residentAuth.cookie)
          .send({ name: 'Test Inst' });
        expect(res.status).toBe(403);
      });

      test('POST /api/programs/institutions creates institution', async () => {
        const res = await request(app)
          .post('/api/programs/institutions')
          .set('Cookie', adminAuth.cookie)
          .send({ name: `Test Hospital ${TEST_SUFFIX}`, type: 'academic' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.institution).toHaveProperty('id');
        institutionId = res.body.institution.id;
      });

      test('POST /api/programs/institutions rejects missing name', async () => {
        const res = await request(app)
          .post('/api/programs/institutions')
          .set('Cookie', adminAuth.cookie)
          .send({ type: 'academic' });
        expect(res.status).toBe(400);
      });

      test('GET /api/programs/institutions lists institutions', async () => {
        const res = await request(app)
          .get('/api/programs/institutions')
          .set('Cookie', residentAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('institutions');
        expect(Array.isArray(res.body.institutions)).toBe(true);
        const found = res.body.institutions.find(i => i.id === institutionId);
        expect(found).toBeDefined();
      });
    });

    // ---- Programs ----
    describe('Program CRUD', () => {
      test('POST /api/programs requires auth', async () => {
        const res = await request(app)
          .post('/api/programs')
          .send({ name: 'Test' });
        expect(res.status).toBe(401);
      });

      test('POST /api/programs creates program', async () => {
        const res = await request(app)
          .post('/api/programs')
          .set('Cookie', adminAuth.cookie)
          .send({ institution_id: institutionId, name: `DR Residency ${TEST_SUFFIX}`, specialty: 'diagnostic_radiology' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        programId = res.body.program.id;
      });

      test('POST /api/programs rejects missing institution', async () => {
        const res = await request(app)
          .post('/api/programs')
          .set('Cookie', adminAuth.cookie)
          .send({ institution_id: 'nonexistent', name: 'Test' });
        expect(res.status).toBe(404);
      });

      test('POST /api/programs rejects missing name', async () => {
        const res = await request(app)
          .post('/api/programs')
          .set('Cookie', adminAuth.cookie)
          .send({ institution_id: institutionId });
        expect(res.status).toBe(400);
      });

      test('GET /api/programs lists user programs', async () => {
        const res = await request(app)
          .get('/api/programs')
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('programs');
        const found = res.body.programs.find(p => p.id === programId);
        expect(found).toBeDefined();
      });

      test('GET /api/programs/:id returns program detail', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('program');
        expect(res.body).toHaveProperty('members');
        expect(res.body.program.id).toBe(programId);
      });

      test('GET /api/programs/:id returns 403 for non-member', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}`)
          .set('Cookie', residentAuth.cookie);
        expect(res.status).toBe(403);
      });

      test('PUT /api/programs/:id updates program (admin)', async () => {
        const res = await request(app)
          .put(`/api/programs/${programId}`)
          .set('Cookie', adminAuth.cookie)
          .send({ name: `Updated DR Residency ${TEST_SUFFIX}` });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      test('PUT /api/programs/:id rejects non-PD', async () => {
        const res = await request(app)
          .put(`/api/programs/${programId}`)
          .set('Cookie', residentAuth.cookie)
          .send({ name: 'Unauthorized Update' });
        expect(res.status).toBe(403);
      });
    });

    // ---- Members ----
    describe('Program Members', () => {
      test('POST /api/programs/:id/members adds member', async () => {
        const res = await request(app)
          .post(`/api/programs/${programId}/members`)
          .set('Cookie', adminAuth.cookie)
          .send({ user_id: residentAuth.userId, role: 'resident', pgy_year: 2 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.member.role).toBe('resident');
      });

      test('POST /api/programs/:id/members rejects duplicate', async () => {
        const res = await request(app)
          .post(`/api/programs/${programId}/members`)
          .set('Cookie', adminAuth.cookie)
          .send({ user_id: residentAuth.userId, role: 'resident' });
        expect(res.status).toBe(409);
      });

      test('POST /api/programs/:id/members rejects non-existent user', async () => {
        const res = await request(app)
          .post(`/api/programs/${programId}/members`)
          .set('Cookie', adminAuth.cookie)
          .send({ user_id: 'nonexistent-user', role: 'resident' });
        expect(res.status).toBe(404);
      });

      test('POST /api/programs/:id/members rejects missing user_id', async () => {
        const res = await request(app)
          .post(`/api/programs/${programId}/members`)
          .set('Cookie', adminAuth.cookie)
          .send({ role: 'resident' });
        expect(res.status).toBe(400);
      });

      test('PUT /api/programs/:id/members/:userId updates member', async () => {
        const res = await request(app)
          .put(`/api/programs/${programId}/members/${residentAuth.userId}`)
          .set('Cookie', adminAuth.cookie)
          .send({ pgy_year: 3, role: 'resident' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      test('PUT /api/programs/:id/members/:userId returns 404 for non-member', async () => {
        const res = await request(app)
          .put(`/api/programs/${programId}/members/nonexistent-user`)
          .set('Cookie', adminAuth.cookie)
          .send({ pgy_year: 3 });
        expect(res.status).toBe(404);
      });

      test('PUT /api/programs/:id/members/:userId rejects non-PD', async () => {
        const res = await request(app)
          .put(`/api/programs/${programId}/members/${residentAuth.userId}`)
          .set('Cookie', residentAuth.cookie)
          .send({ pgy_year: 4 });
        expect(res.status).toBe(403);
      });

      test('resident can now access program detail', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}`)
          .set('Cookie', residentAuth.cookie);
        expect(res.status).toBe(200);
      });

      test('add attending as faculty', async () => {
        const res = await request(app)
          .post(`/api/programs/${programId}/members`)
          .set('Cookie', adminAuth.cookie)
          .send({ user_id: attendingAuth.userId, role: 'faculty' });
        expect(res.status).toBe(200);
      });
    });

    // ---- Dashboard & Reports ----
    describe('Program Dashboard & Reports', () => {
      test('GET /api/programs/:id/dashboard returns dashboard data', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/dashboard`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('program');
        expect(res.body).toHaveProperty('residentsByYear');
        expect(res.body).toHaveProperty('milestoneAvgs');
        expect(res.body).toHaveProperty('recentActivity');
        expect(res.body).toHaveProperty('atRiskResidents');
      });

      test('GET /api/programs/:id/dashboard accessible by faculty', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/dashboard`)
          .set('Cookie', attendingAuth.cookie);
        expect(res.status).toBe(200);
      });

      test('GET /api/programs/:id/dashboard rejects resident', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/dashboard`)
          .set('Cookie', residentAuth.cookie);
        expect(res.status).toBe(403);
      });

      test('GET /api/programs/:id/residents/:userId returns resident detail', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/residents/${residentAuth.userId}`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('resident');
        expect(res.body).toHaveProperty('milestoneProgress');
        expect(res.body).toHaveProperty('gaps');
        expect(res.body).toHaveProperty('recentPerformance');
      });

      test('GET /api/programs/:id/residents/:userId returns 404 for non-member', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/residents/nonexistent-user`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(404);
      });

      test('GET /api/programs/:id/at-risk returns at-risk list', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/at-risk`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('atRisk');
        expect(res.body).toHaveProperty('count');
      });

      test('GET /api/programs/:id/milestone-report returns report', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/milestone-report`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('program');
        expect(res.body).toHaveProperty('residents');
        expect(res.body).toHaveProperty('milestoneDefinitions');
        expect(res.body).toHaveProperty('generatedAt');
      });

      test('GET /api/programs/:id/milestone-report rejects non-PD', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/milestone-report`)
          .set('Cookie', residentAuth.cookie);
        expect(res.status).toBe(403);
      });
    });

    // ---- Cohort Stats ----
    describe('Cohort Statistics', () => {
      test('POST /api/programs/:id/cohort-snapshot generates snapshot', async () => {
        const res = await request(app)
          .post(`/api/programs/${programId}/cohort-snapshot`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('snapshots');
      });

      test('GET /api/programs/:id/cohort-stats returns stats', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/cohort-stats`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('snapshots');
      });

      test('cohort-stats rejects resident', async () => {
        const res = await request(app)
          .get(`/api/programs/${programId}/cohort-stats`)
          .set('Cookie', residentAuth.cookie);
        expect(res.status).toBe(403);
      });

      test('cohort-snapshot rejects non-PD', async () => {
        const res = await request(app)
          .post(`/api/programs/${programId}/cohort-snapshot`)
          .set('Cookie', residentAuth.cookie);
        expect(res.status).toBe(403);
      });
    });

    // ---- Member Removal ----
    describe('Member Removal', () => {
      test('DELETE /api/programs/:id/members/:userId rejects non-PD', async () => {
        const res = await request(app)
          .delete(`/api/programs/${programId}/members/${residentAuth.userId}`)
          .set('Cookie', residentAuth.cookie);
        expect(res.status).toBe(403);
      });

      test('DELETE /api/programs/:id/members/:userId returns 404 for non-member', async () => {
        const res = await request(app)
          .delete(`/api/programs/${programId}/members/nonexistent-user`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(404);
      });

      test('DELETE /api/programs/:id/members/:userId removes member', async () => {
        const res = await request(app)
          .delete(`/api/programs/${programId}/members/${attendingAuth.userId}`)
          .set('Cookie', adminAuth.cookie);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });
    });
  });

  // ============ CME API ============
  describe('CME API', () => {
    test('GET /api/cme requires auth', async () => {
      const res = await request(app).get('/api/cme');
      expect(res.status).toBe(401);
    });

    test('GET /api/cme/summary requires auth', async () => {
      const res = await request(app).get('/api/cme/summary');
      expect(res.status).toBe(401);
    });

    test('POST /api/cme/record requires auth', async () => {
      const res = await request(app).post('/api/cme/record').send({});
      expect(res.status).toBe(401);
    });

    test('POST /api/cme/record records a credit', async () => {
      const res = await request(app)
        .post('/api/cme/record')
        .set('Cookie', residentAuth.cookie)
        .send({
          activity_type: 'case_review',
          credits: 0.25,
          category: 'SA-CME',
          title: 'Test Case Review'
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.credit.credits).toBe(0.25);
    });

    test('POST /api/cme/record rejects missing activity_type', async () => {
      const res = await request(app)
        .post('/api/cme/record')
        .set('Cookie', residentAuth.cookie)
        .send({ credits: 1.0 });
      expect(res.status).toBe(400);
    });

    test('POST /api/cme/record rejects invalid credits', async () => {
      const res = await request(app)
        .post('/api/cme/record')
        .set('Cookie', residentAuth.cookie)
        .send({ activity_type: 'case_review', credits: -1 });
      expect(res.status).toBe(400);
    });

    test('POST /api/cme/record rejects zero credits', async () => {
      const res = await request(app)
        .post('/api/cme/record')
        .set('Cookie', residentAuth.cookie)
        .send({ activity_type: 'case_review', credits: 0 });
      expect(res.status).toBe(400);
    });

    test('POST /api/cme/record records multiple credits', async () => {
      await request(app)
        .post('/api/cme/record')
        .set('Cookie', residentAuth.cookie)
        .send({ activity_type: 'oral_board', credits: 1.0, category: 'SA-CME', title: 'Oral Board Session' });

      await request(app)
        .post('/api/cme/record')
        .set('Cookie', residentAuth.cookie)
        .send({ activity_type: 'collection_complete', credits: 2.0, category: 'CME', title: 'Collection Complete' });

      const res = await request(app)
        .get('/api/cme')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body.credits.length).toBeGreaterThanOrEqual(3);
      expect(res.body.total).toBeGreaterThanOrEqual(3.25);
    });

    test('GET /api/cme returns credits with pagination', async () => {
      const res = await request(app)
        .get('/api/cme?limit=2&offset=0')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body.credits.length).toBeLessThanOrEqual(2);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('offset');
    });

    test('GET /api/cme filters by category', async () => {
      const res = await request(app)
        .get('/api/cme?category=CME')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      for (const credit of res.body.credits) {
        expect(credit.category).toBe('CME');
      }
    });

    test('GET /api/cme/summary returns summary', async () => {
      const res = await request(app)
        .get('/api/cme/summary')
        .set('Cookie', residentAuth.cookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalCredits');
      expect(res.body).toHaveProperty('byCategory');
      expect(res.body).toHaveProperty('byYear');
      expect(res.body.totalCredits).toBeGreaterThanOrEqual(3.25);
    });
  });

  // ============ MilestoneEngine Unit Tests ============
  describe('MilestoneEngine', () => {
    const MilestoneEngine = require('../lib/milestone-engine');
    let engineDb;
    let engineInstance;

    beforeAll(() => {
      engineDb = new Database(path.join(__dirname, '..', 'radcase.db'));
      engineInstance = new MilestoneEngine(engineDb);
    });

    afterAll(() => {
      engineDb.close();
    });

    test('calculateMilestoneLevel returns result for valid user/milestone', () => {
      const result = engineInstance.calculateMilestoneLevel(residentAuth.userId, 'DR-PC1');
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('milestoneId', 'DR-PC1');
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('activityCount');
      expect(result.level).toBeGreaterThanOrEqual(1.0);
      expect(result.level).toBeLessThanOrEqual(5.0);
    });

    test('calculateMilestoneLevel returns null for invalid milestone', () => {
      const result = engineInstance.calculateMilestoneLevel(residentAuth.userId, 'INVALID');
      expect(result).toBeNull();
    });

    test('recalculateAll returns results for all milestones', () => {
      const results = engineInstance.recalculateAll(residentAuth.userId);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(15);
    });

    test('getProgressSummary returns structured summary', () => {
      const summary = engineInstance.getProgressSummary(residentAuth.userId);
      expect(summary).toHaveProperty('overallLevel');
      expect(summary).toHaveProperty('domains');
      expect(summary).toHaveProperty('totalMilestones', 15);
      expect(summary.domains.length).toBe(6);
      for (const d of summary.domains) {
        expect(d).toHaveProperty('domain');
        expect(d).toHaveProperty('milestones');
        expect(d).toHaveProperty('avgLevel');
      }
    });

    test('getGapAnalysis returns gap data', () => {
      const gaps = engineInstance.getGapAnalysis(residentAuth.userId);
      expect(gaps).toHaveProperty('expectedLevel');
      expect(gaps).toHaveProperty('gaps');
      expect(gaps).toHaveProperty('totalGaps');
      for (const g of gaps.gaps) {
        expect(g).toHaveProperty('milestoneId');
        expect(g).toHaveProperty('gap');
        expect(g).toHaveProperty('priority');
        expect(['high', 'medium', 'low']).toContain(g.priority);
      }
    });

    test('autoTagCase tags a case to milestones', () => {
      const tags = engineInstance.autoTagCase(testCaseId);
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
      const pc2 = tags.find(t => t.milestoneId === 'DR-PC2');
      expect(pc2).toBeDefined();
    });

    test('autoTagCase returns empty for non-existent case', () => {
      const tags = engineInstance.autoTagCase('nonexistent');
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBe(0);
    });

    test('calculateCMECredits returns correct credits for case_review', () => {
      const result = engineInstance.calculateCMECredits('case_review', { caseTitle: 'Test' });
      expect(result).not.toBeNull();
      expect(result.credits).toBe(0.25);
      expect(result.category).toBe('SA-CME');
    });

    test('calculateCMECredits returns correct credits for oral_board', () => {
      const result = engineInstance.calculateCMECredits('oral_board', { caseTitle: 'Test' });
      expect(result.credits).toBe(1.0);
    });

    test('calculateCMECredits returns correct credits for quiz_session', () => {
      const result = engineInstance.calculateCMECredits('quiz_session', { questionCount: 20 });
      expect(result.credits).toBe(1.0); // 20/10 * 0.5
    });

    test('calculateCMECredits returns correct credits for collection_complete', () => {
      const result = engineInstance.calculateCMECredits('collection_complete', { collectionName: 'Test' });
      expect(result.credits).toBe(2.0);
      expect(result.category).toBe('CME');
    });

    test('calculateCMECredits returns null for unknown type', () => {
      const result = engineInstance.calculateCMECredits('unknown', {});
      expect(result).toBeNull();
    });

    test('calculateCMECredits returns null for zero quiz questions', () => {
      const result = engineInstance.calculateCMECredits('quiz_session', { questionCount: 5 });
      expect(result).toBeNull();
    });

    test('_calculateLevel returns appropriate levels', () => {
      // Access the private method
      expect(engineInstance._calculateLevel(0, 0.3)).toBe(1.0);
      expect(engineInstance._calculateLevel(5, 0.4)).toBe(1.0);
      expect(engineInstance._calculateLevel(20, 0.6)).toBe(2.0);
      expect(engineInstance._calculateLevel(50, 0.75)).toBe(3.0);
      expect(engineInstance._calculateLevel(80, 0.85)).toBe(4.0);
      expect(engineInstance._calculateLevel(120, 0.95)).toBe(5.0);
    });

    test('identifyAtRisk returns array', () => {
      const result = engineInstance.identifyAtRisk(programId);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
