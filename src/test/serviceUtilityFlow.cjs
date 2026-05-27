process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const mongoose = require('mongoose');

const { connectTestDb, clearTestDb, disconnectTestDb } = require('./helpers/db.cjs');
const { seedRoles, createUser, createOrganization } = require('./helpers/fixtures.cjs');
const Organization = require('../models/Organization');
const User = require('../models/User');
const orgService = require('../services/orgService');
const userService = require('../services/userService');
const patientService = require('../services/patientService');
const { parseStringArray } = require('../utils/arrayUtils');

const { expect } = chai;

describe('service and utility flow', function () {
  this.timeout(15000);

  before(connectTestDb);
  beforeEach(clearTestDb);
  after(disconnectTestDb);

  it('covers id normalization and array utility branches', () => {
    const id = new mongoose.Types.ObjectId();
    expect(orgService.toId(id)).to.equal(String(id));
    expect(orgService.toId({ _id: id })).to.equal(String(id));
    expect(orgService.toId(`ObjectId("${id}")`)).to.equal(String(id));
    expect(orgService.toId('not-valid')).to.equal(undefined);

    expect(parseStringArray(['A', 'B'])).to.deep.equal(['A', 'B']);
    expect(parseStringArray('A, B, ,C')).to.deep.equal(['A', 'B', 'C']);
    expect(parseStringArray(null)).to.deep.equal([]);

    expect(patientService.calculateAge(null)).to.equal(null);
    expect(patientService.calculateAge('2000-01-01')).to.be.a('number');
  });

  it('covers orgService admin resolution, membership and staff helper branches', async () => {
    const roles = await seedRoles();
    const admin = await createUser({ fullname: 'Service Admin', email: 'service-admin@example.com', role: roles.admin });
    const nurse = await createUser({ fullname: 'Service Nurse', email: 'service-nurse@example.com', role: roles.nurse });
    const caretaker = await createUser({ fullname: 'Service Caretaker', email: 'service-caretaker@example.com', role: roles.caretaker });
    const org = await createOrganization({ name: 'Service Org', admin });

    expect(orgService.assertSameOrg(org, nurse)).to.not.equal(true);
    expect(orgService.isUserInOrg(admin, org)).to.equal(true);
    expect(orgService.isUserInOrg(nurse, org)).to.equal(false);

    const foundById = await orgService.findAdminOrg(admin._id, org._id);
    expect(String(foundById._id)).to.equal(String(org._id));

    const foundByReqLike = await orgService.findAdminOrg({ user: { _id: admin._id }, query: { orgId: org._id } });
    expect(String(foundByReqLike._id)).to.equal(String(org._id));

    let threw = false;
    try {
      await orgService.findAdminOrg();
    } catch (error) {
      threw = true;
      expect(error.status).to.equal(400);
    }
    expect(threw).to.equal(true);

    const previewLink = await orgService.linkCaretakerToOrgIfFreelance(caretaker, org, { applyLink: false });
    expect(previewLink.needsOrgLink).to.equal(true);

    const appliedLink = await orgService.linkCaretakerToOrgIfFreelance(caretaker, org, { applyLink: true });
    expect(appliedLink.linked).to.equal(true);

    const refreshedCaretaker = await User.findById(caretaker._id);
    const alreadyInOrg = await orgService.linkCaretakerToOrgIfFreelance(refreshedCaretaker, org);
    expect(alreadyInOrg.alreadyInOrg).to.equal(true);

    const secondOrg = await Organization.create({ name: 'Second Service Org', active: true, createdBy: admin._id, staff: [admin._id] });
    const moved = await orgService.linkCaretakerToOrgIfFreelance(refreshedCaretaker, secondOrg);
    expect(moved.movedFromOtherOrg).to.equal(true);

    const added = await orgService.addUserToOrgStaff(org._id, nurse._id);
    expect(added.staff.map(String)).to.include(String(nurse._id));

    const removed = await orgService.removeUserFromOrgStaff(org._id, nurse._id);
    expect(removed.staff.map(String)).to.not.include(String(nurse._id));
  });

  it('covers orgService and userService validation/error branches', async () => {
    const roles = await seedRoles();
    const admin = await createUser({ fullname: 'Validation Admin', email: 'validation-admin@example.com', role: roles.admin });
    const nurse = await createUser({ fullname: 'Validation Nurse', email: 'validation-nurse@example.com', role: roles.nurse });
    const org = await createOrganization({ name: 'Validation Org', admin });

    expect(await userService.getRoleByName('NURSE')).to.have.property('name', 'nurse');
    expect(await userService.ensureUserWithRole(nurse._id, 'nurse')).to.exist;
    expect(await userService.ensureUserWithRole(nurse._id, 'doctor')).to.equal(null);
    expect(await userService.ensureUserWithRole('not-valid', 'nurse')).to.equal(null);

    await userService.setUserOrganization(nurse._id, org._id);
    const linked = await User.findById(nurse._id).lean();
    expect(String(linked.organization)).to.equal(String(org._id));

    let threw = false;
    try {
      await orgService.resolveAdminOrg({ adminUserId: null });
    } catch (error) {
      threw = true;
      expect(error.status).to.equal(400);
    }
    expect(threw).to.equal(true);

    threw = false;
    try {
      await orgService.resolveAdminOrg({ adminUserId: new mongoose.Types.ObjectId(), orgIdFromQuery: org._id });
    } catch (error) {
      threw = true;
      expect(error.status).to.equal(404);
    }
    expect(threw).to.equal(true);

    threw = false;
    try {
      await orgService.addUserToOrgStaff(null, nurse._id);
    } catch (error) {
      threw = true;
      expect(error.status).to.equal(400);
    }
    expect(threw).to.equal(true);

    const inactive = await Organization.create({ name: 'Inactive Service Org', active: false, createdBy: admin._id, staff: [admin._id] });
    threw = false;
    try {
      await orgService.addUserToOrgStaff(inactive._id, nurse._id);
    } catch (error) {
      threw = true;
      expect(error.status).to.equal(400);
    }
    expect(threw).to.equal(true);

    threw = false;
    try {
      await orgService.removeUserFromOrgStaff(new mongoose.Types.ObjectId(), nurse._id);
    } catch (error) {
      threw = true;
      expect(error.status).to.equal(404);
    }
    expect(threw).to.equal(true);
  });
});
