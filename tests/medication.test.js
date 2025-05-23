const request = require('supertest');
const app = require('../../src/server');
const mongoose = require('mongoose');
const MedicationRecord = require('../../src/models/MedicationRecord');

let token;
let patientId;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nurse@example.com', password: 'Password123' });

  token = res.body.token;
  patientId = 'PATIENT_OBJECT_ID'; // replace with a seeded patient ID
});

afterAll(async () => {
  await MedicationRecord.deleteMany({});
  await mongoose.connection.close();
});

describe('Medication Record API', () => {
  test('POST /patients/:patientId/medications - submit medication record', async () => {
    const response = await request(app)
      .post(`/api/v1/patients/${patientId}/medications`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        allergies: ['penicillin'],
        records: [{
          medicationName: 'Amoxicillin',
          dosage: '500mg',
          frequency: '3x/day',
          route: 'oral',
          indication: 'Bacterial infection',
          notes: 'Take with food'
        }],
        changes: 'Initial prescription'
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.medRecord).toHaveProperty('_id');
  });

  test('GET /patients/:patientId/medications - retrieve medication record', async () => {
    const response = await request(app)
      .get(`/api/v1/patients/${patientId}/medications`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('records');
    expect(Array.isArray(response.body.records)).toBe(true);
  });
});
