process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const createTestApp = require('./helpers/testApp.cjs');
const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, authHeader } = require('./helpers/fixtures.cjs');
const WifiCSI = require('../models/WifiCSI');
const Alert = require('../models/Alert');

chai.use(chaiHttp);
const { expect } = chai;
const app = createTestApp();

describe('AI signal and alert flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('creates and lists Wi-Fi CSI records only for the authenticated user', async () => {
    const roles = await seedRoles();
    const nurse = await createUser({ fullname: 'CSI Nurse', email: 'csi-nurse@example.com', role: roles.nurse });
    const otherNurse = await createUser({ fullname: 'Other CSI Nurse', email: 'other-csi-nurse@example.com', role: roles.nurse });

    await WifiCSI.create({
      user_id: otherNurse._id,
      timestamp: new Date('2026-05-01T10:00:00Z'),
      csi_data: { samples: [9, 9, 9] },
    });

    const createRes = await chai
      .request(app)
      .post('/api/v1/wifi-csi')
      .set('Authorization', authHeader(nurse))
      .send({
        timestamp: '2026-05-01T09:00:00Z',
        csi_data: { samples: [1, 2, 3], room: 'A1' },
      });

    expect(createRes).to.have.status(201);
    expect(String(createRes.body.user_id)).to.equal(String(nurse._id));

    const listRes = await chai
      .request(app)
      .get('/api/v1/wifi-csi')
      .set('Authorization', authHeader(nurse));

    expect(listRes).to.have.status(200);
    expect(listRes.body).to.have.length(1);
    expect(String(listRes.body[0].user_id)).to.equal(String(nurse._id));
  });

  it('creates activity recognition records linked to CSI data', async () => {
    const roles = await seedRoles();
    const nurse = await createUser({ fullname: 'Activity Nurse', email: 'activity-nurse@example.com', role: roles.nurse });
    const wifi = await WifiCSI.create({
      user_id: nurse._id,
      timestamp: new Date('2026-05-01T09:00:00Z'),
      csi_data: { samples: [1, 2, 3] },
    });

    const createRes = await chai
      .request(app)
      .post('/api/v1/activity-recognition')
      .set('Authorization', authHeader(nurse))
      .send({
        wifi_csi_id: String(wifi._id),
        activity_type: 'fall_detected',
        confidence: 0.96,
        detected_at: '2026-05-01T09:01:00Z',
      });

    expect(createRes).to.have.status(201);
    expect(createRes.body.activity_type).to.equal('fall_detected');
    expect(String(createRes.body.wifi_csi_id)).to.equal(String(wifi._id));

    const listRes = await chai
      .request(app)
      .get('/api/v1/activity-recognition')
      .set('Authorization', authHeader(nurse));

    expect(listRes).to.have.status(200);
    expect(listRes.body).to.have.length(1);
  });

  it('creates and lists alerts for the authenticated user only', async () => {
    const roles = await seedRoles();
    const nurse = await createUser({ fullname: 'Alert Nurse', email: 'alert-nurse@example.com', role: roles.nurse });
    const caretaker = await createUser({ fullname: 'Alert Caretaker', email: 'alert-caretaker@example.com', role: roles.caretaker });

    await Alert.create({
      user_id: caretaker._id,
      alert_type: 'medication',
      message: 'Hidden caretaker alert',
    });

    const createRes = await chai
      .request(app)
      .post('/api/v1/alerts')
      .set('Authorization', authHeader(nurse))
      .send({
        alert_type: 'fall',
        message: 'Fall detected for assigned patient',
      });

    expect(createRes).to.have.status(201);
    expect(createRes.body.alert_type).to.equal('fall');
    expect(String(createRes.body.user_id)).to.equal(String(nurse._id));

    const listRes = await chai
      .request(app)
      .get('/api/v1/alerts')
      .set('Authorization', authHeader(nurse));

    expect(listRes).to.have.status(200);
    expect(listRes.body).to.have.length(1);
    expect(listRes.body[0].message).to.equal('Fall detected for assigned patient');
  });
});
