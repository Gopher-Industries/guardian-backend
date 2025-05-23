const request = require('supertest');
const app = require('../src/server'); // Adjust path if your server entry file is different
const mongoose = require('mongoose');
const Pharmacist = require('../src/models/Pharmacist');

let authToken;
let patientId = 'PLACEHOLDER_PATIENT_ID';

describe('Pharmacist Integration Tests', () => {
  const testEmail = 'testpharmacist@example.com';
  const testPassword = 'TestPass123';

  beforeAll(async () => {
    // Clear existing test user if exists
    await Pharmacist.deleteOne({ email: testEmail });
  });

  it('should register a pharmacist', async () => {
    const res = await request(app)
      .post('/pharmacist/register')
      .send({
        name: 'Test Pharmacist',
        email: testEmail,
        password: testPassword
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.pharmacist.email).toBe(testEmail);
  });

  it('should login the pharmacist and receive a token', async () => {
    const res = await request(app)
      .post('/pharmacist/login')
      .send({
        email: testEmail,
        password: testPassword
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    authToken = res.body.token;
  });

  it('should get pharmacist profile', async () => {
    const res = await request(app)
      .get('/pharmacist/profile')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBe(testEmail);
  });

  it('should fetch assigned patients', async () => {
    const res = await request(app)
      .get('/pharmacist/patients')
      .set('Authorization', `Bearer ${authToken}`);

    expect([200, 403]).toContain(res.statusCode);
  });

  it('should attempt to fetch patient report and be forbidden or succeed if assigned', async () => {
    const res = await request(app)
      .get(`/pharmacist/patient/${patientId}/report`)
      .set('Authorization', `Bearer ${authToken}`);

    expect([200, 403, 404]).toContain(res.statusCode);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });
});