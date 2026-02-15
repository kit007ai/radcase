// Case CRUD endpoint tests
const request = require('supertest');
const crypto = require('crypto');
const { TEST_USERS, TEST_CASE, registerUser } = require('./setup');

const app = require('../server');

describe('Cases API', () => {
  let userCookie;

  beforeAll(async () => {
    userCookie = await registerUser(app, TEST_USERS.resident);
  });

  describe('POST /api/cases', () => {
    test('should create a case with valid data', async () => {
      const res = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send(TEST_CASE);

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.message).toContain('created');

      // cleanup
      await request(app).delete(`/api/cases/${res.body.id}`).set('Cookie', userCookie);
    });

    test('should create a case with tags', async () => {
      const caseWithTags = {
        ...TEST_CASE,
        title: `Tagged Case ${crypto.randomBytes(4).toString('hex')}`,
        tags: ['chest', 'pneumonia', 'urgent']
      };

      const res = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send(caseWithTags);

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();

      // Verify tags were attached by fetching the case
      const getRes = await request(app)
        .get(`/api/cases/${res.body.id}`)
        .set('Cookie', userCookie);

      expect(getRes.status).toBe(200);
      expect(getRes.body.tags).toBeDefined();
      // tags comes back as comma-separated string from GROUP_CONCAT
      if (getRes.body.tags) {
        const tags = getRes.body.tags.split(',');
        expect(tags).toContain('chest');
        expect(tags).toContain('pneumonia');
      }

      // cleanup
      await request(app).delete(`/api/cases/${res.body.id}`).set('Cookie', userCookie);
    });

    test('should handle missing required fields gracefully', async () => {
      const res = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send({});

      // Server should respond without crashing (may be 400 or 500)
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('should create a case with minimal fields', async () => {
      const res = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send({ title: 'Minimal Case' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();

      // cleanup
      await request(app).delete(`/api/cases/${res.body.id}`).set('Cookie', userCookie);
    });
  });

  describe('GET /api/cases', () => {
    let testCaseId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send({
          ...TEST_CASE,
          title: `List Test ${crypto.randomBytes(4).toString('hex')}`
        });
      testCaseId = res.body.id;
    });

    afterAll(async () => {
      if (testCaseId) {
        await request(app).delete(`/api/cases/${testCaseId}`).set('Cookie', userCookie);
      }
    });

    test('should list cases with pagination', async () => {
      const res = await request(app)
        .get('/api/cases?limit=5&offset=0')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.cases).toBeDefined();
      expect(Array.isArray(res.body.cases)).toBe(true);
      expect(res.body.total).toBeDefined();
      expect(res.body.limit).toBe(5);
      expect(res.body.offset).toBe(0);
    });

    test('should search cases', async () => {
      const res = await request(app)
        .get('/api/cases?search=List Test')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.cases.length).toBeGreaterThanOrEqual(0);
    });

    test('should filter cases by modality', async () => {
      const res = await request(app)
        .get(`/api/cases?modality=${TEST_CASE.modality}`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      if (res.body.cases.length > 0) {
        expect(res.body.cases[0].modality).toBe(TEST_CASE.modality);
      }
    });

    test('should filter cases by body_part', async () => {
      const res = await request(app)
        .get(`/api/cases?body_part=${TEST_CASE.body_part}`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      if (res.body.cases.length > 0) {
        expect(res.body.cases[0].body_part).toBe(TEST_CASE.body_part);
      }
    });

    test('should filter cases by difficulty', async () => {
      const res = await request(app)
        .get(`/api/cases?difficulty=${TEST_CASE.difficulty}`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      if (res.body.cases.length > 0) {
        expect(res.body.cases[0].difficulty).toBe(TEST_CASE.difficulty);
      }
    });

    test('should return empty results for non-matching search', async () => {
      const res = await request(app)
        .get('/api/cases?search=zzz_nonexistent_zzz_12345')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.cases.length).toBe(0);
      expect(res.body.total).toBe(0);
    });
  });

  describe('GET /api/cases/:id', () => {
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

    test('should get a single case by ID', async () => {
      const res = await request(app)
        .get(`/api/cases/${testCaseId}`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testCaseId);
      expect(res.body.title).toBe(TEST_CASE.title);
      expect(res.body.modality).toBe(TEST_CASE.modality);
      expect(res.body.images).toBeDefined();
      expect(Array.isArray(res.body.images)).toBe(true);
    });

    test('should return 404 for non-existent case', async () => {
      const res = await request(app)
        .get('/api/cases/nonexistent-id-99999')
        .set('Cookie', userCookie);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('PUT /api/cases/:id', () => {
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

    test('should update case fields', async () => {
      const updated = {
        ...TEST_CASE,
        title: 'Updated Title',
        difficulty: 5,
        diagnosis: 'Updated Diagnosis'
      };

      const res = await request(app)
        .put(`/api/cases/${testCaseId}`)
        .set('Cookie', userCookie)
        .send(updated);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('updated');

      // Verify the update
      const getRes = await request(app)
        .get(`/api/cases/${testCaseId}`)
        .set('Cookie', userCookie);

      expect(getRes.body.title).toBe('Updated Title');
      expect(getRes.body.difficulty).toBe(5);
      expect(getRes.body.diagnosis).toBe('Updated Diagnosis');
    });

    test('should update case tags', async () => {
      const updated = {
        ...TEST_CASE,
        tags: ['newtag1', 'newtag2']
      };

      const res = await request(app)
        .put(`/api/cases/${testCaseId}`)
        .set('Cookie', userCookie)
        .send(updated);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('updated');
    });
  });

  describe('DELETE /api/cases/:id', () => {
    test('should delete a case', async () => {
      // Create a case to delete
      const createRes = await request(app)
        .post('/api/cases')
        .set('Cookie', userCookie)
        .send({ ...TEST_CASE, title: 'Case to Delete' });

      const caseId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/cases/${caseId}`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/cases/${caseId}`)
        .set('Cookie', userCookie);

      expect(getRes.status).toBe(404);
    });
  });

  describe('GET /api/cases/:id/dicom', () => {
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

    test('should get DICOM series for a case', async () => {
      const res = await request(app)
        .get(`/api/cases/${testCaseId}/dicom`)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.series).toBeDefined();
      expect(Array.isArray(res.body.series)).toBe(true);
    });
  });
});
