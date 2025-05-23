const request = require('supertest');
const app = require('../../src/server'); // Adjust path as needed
const mongoose = require('mongoose');
const IncidentReport = require('../../src/models/IncidentReport');

let token;
let patientId;
let testIncidentId;

beforeAll(async () => {
  // Simulate login to get token (replace with real implementation)
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nurse@example.com', password: 'Password123' });
  token = res.body.token;
  patientId = 'PATIENT_OBJECT_ID'; // Replace with a real patient ID in your seeded DB
});

afterAll(async () => {
  await IncidentReport.deleteMany({});
  mongoose.connection.close();
});

describe('Incident Report API', () => {
  test('POST /patients/:patientId/incidents - create incident report', async () => {
    const response = await request(app)
      .post(`/api/v1/patients/${patientId}/incidents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        incidentType: 'Test Fall',
        description: 'Patient tripped on rug.',
        followUpActions: 'Removed rug. Educated patient on hazards.'
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.report).toHaveProperty('_id');
    testIncidentId = response.body.report._id;
  });

  test('GET /patients/:patientId/incidents - fetch incident reports', async () => {
    const response = await request(app)
      .get(`/api/v1/patients/${patientId}/incidents`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
  });
});
