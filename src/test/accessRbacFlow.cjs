/**
 * Guardian — RBAC tests: role inheritance, multi-role union, role lifecycle.
 *
 * The patient-scoping half is covered by accessControlApiFlow.cjs. This file
 * covers the capability half on its own — the part that has nothing to do with
 * patients and works as plain RBAC.
 *
 * No database required.
 *
 * Run:  npx mocha src/test/accessRbacFlow.cjs --exit
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const chai = require('chai');
const chaiHttp = require('chai-http');

const { buildWorld, authHeader } = require('./helpers/accessTestApp.cjs');
const { expandRole, resolveRoles, wouldCreateCycle, descendantsOf } = require('../access/roleResolver');

chai.use(chaiHttp);
const { expect } = chai;

const RECORD = (patientId) => `/api/v1/access/demo/patients/${patientId}/record`;

/* ------------------------------------------------------------------ *
 * Pure resolver
 * ------------------------------------------------------------------ */

describe('role resolver — inheritance', () => {
  const matrix = {
    base: { roleName: 'base', permissions: ['patient:read'], inherits: [] },
    nurse: { roleName: 'nurse', permissions: ['patient.log:write'], inherits: ['base'] },
    'senior-nurse': { roleName: 'senior-nurse', permissions: ['patient.careplan:write'], inherits: ['nurse'] },
    lonely: { roleName: 'lonely', permissions: ['patient:read'], inherits: ['ghost'] }
  };

  it('expands transitively through the chain', () => {
    const expanded = expandRole('senior-nurse', matrix);
    expect(expanded.permissions).to.have.members(['patient.careplan:write', 'patient.log:write', 'patient:read']);
    expect(expanded.chain).to.deep.equal(['senior-nurse', 'nurse', 'base']);
  });

  it('propagates unscoped and canGrant up the chain', () => {
    const withFlags = Object.assign({}, matrix, {
      base: { roleName: 'base', permissions: ['patient:read'], inherits: [], canGrant: true }
    });
    expect(expandRole('senior-nurse', withFlags).canGrant).to.equal(true);
  });

  it('reports a missing parent instead of throwing', () => {
    const expanded = expandRole('lonely', matrix);
    expect(expanded.missing).to.deep.equal(['ghost']);
    expect(expanded.permissions).to.deep.equal(['patient:read']);
  });

  it('breaks a cycle rather than recursing forever', () => {
    const cyclic = {
      a: { roleName: 'a', permissions: ['patient:read'], inherits: ['b'] },
      b: { roleName: 'b', permissions: ['patient.log:read'], inherits: ['a'] }
    };
    const expanded = expandRole('a', cyclic);
    expect(expanded.cycles).to.include('a');
    expect(expanded.permissions).to.have.members(['patient:read', 'patient.log:read']);
  });

  it('detects a cycle before it is written', () => {
    expect(wouldCreateCycle('base', 'senior-nurse', matrix)).to.equal(true);
    expect(wouldCreateCycle('senior-nurse', 'base', matrix)).to.equal(false);
    expect(wouldCreateCycle('base', 'base', matrix)).to.equal(true);
  });

  it('lists the roles that depend on one', () => {
    expect(descendantsOf('base', matrix)).to.have.members(['nurse', 'senior-nurse']);
  });
});

describe('role resolver — multi-role union', () => {
  const matrix = {
    nurse: { roleName: 'nurse', permissions: ['patient:read', 'patient.log:write'], inherits: [] },
    auditor: { roleName: 'auditor', permissions: ['access.audit:read'], inherits: [], canGrant: false },
    admin: { roleName: 'admin', permissions: ['*'], inherits: [], unscoped: true, canGrant: true }
  };

  it('is the union of every role held', () => {
    const resolved = resolveRoles(['nurse', 'auditor'], matrix);
    expect(resolved.capabilities).to.have.members(['patient:read', 'patient.log:write', 'access.audit:read']);
  });

  it('one unscoped role is enough to make the user unscoped', () => {
    expect(resolveRoles(['nurse', 'admin'], matrix).unscoped).to.equal(true);
    expect(resolveRoles(['nurse', 'auditor'], matrix).unscoped).to.equal(false);
  });

  it('adding a role never subtracts — there are no deny rules', () => {
    const alone = resolveRoles(['nurse'], matrix).capabilities;
    const both = resolveRoles(['nurse', 'auditor'], matrix).capabilities;
    alone.forEach((code) => expect(both).to.include(code));
  });

  it('ignores duplicates and blank entries', () => {
    const resolved = resolveRoles(['nurse', 'NURSE', '', null, 'nurse'], matrix);
    expect(resolved.roleNames).to.deep.equal(['nurse']);
  });
});

/* ------------------------------------------------------------------ *
 * Role lifecycle over HTTP
 * ------------------------------------------------------------------ */

describe('RBAC API — role lifecycle', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  const admin = () => authHeader(world.users.admin);

  async function createRole(body, actor) {
    return chai.request(world.app).post('/api/v1/access/roles').set('Authorization', actor || admin()).send(body);
  }

  it('creates a role and it appears in the matrix', async () => {
    const res = await createRole({
      roleName: 'ward-coordinator',
      displayName: 'Ward Coordinator',
      permissions: ['patient:read', 'patient.careplan:write']
    });

    expect(res).to.have.status(201);
    expect(res.body.role.isSystem).to.equal(false);

    const matrix = await chai.request(world.app).get('/api/v1/access/matrix').set('Authorization', admin());
    expect(matrix.body.matrix).to.have.property('ward-coordinator');
  });

  it('clones an existing role', async () => {
    const res = await createRole({ roleName: 'agency-nurse', cloneFrom: 'nurse' });
    expect(res).to.have.status(201);

    const matrix = await chai.request(world.app).get('/api/v1/access/matrix').set('Authorization', admin());
    expect(res.body.role.permissions).to.have.members(matrix.body.matrix.nurse.permissions);
  });

  it('refuses a duplicate role', async () => {
    await createRole({ roleName: 'physio', permissions: ['patient:read'] });
    const again = await createRole({ roleName: 'physio', permissions: ['patient:read'] });
    expect(again).to.have.status(409);
    expect(again.body.code).to.equal('ROLE_EXISTS');
  });

  it('refuses an invalid role name', async () => {
    const res = await createRole({ roleName: 'Ward Coordinator!', permissions: ['patient:read'] });
    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('ROLE_NAME_INVALID');
  });

  it('refuses an unknown permission code', async () => {
    const res = await createRole({ roleName: 'physio', permissions: ['patient:teleport'] });
    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('UNKNOWN_PERMISSION');
  });

  it('refuses inheritance from a role that does not exist', async () => {
    const res = await createRole({ roleName: 'physio', permissions: ['patient:read'], inherits: ['ghost'] });
    expect(res).to.have.status(400);
    expect(res.body.code).to.equal('UNKNOWN_PARENT_ROLE');
  });

  it('refuses an inheritance cycle at edit time', async () => {
    await createRole({ roleName: 'senior-nurse', permissions: ['patient.careplan:write'], inherits: ['nurse'] });

    const res = await chai
      .request(world.app)
      .put('/api/v1/access/roles/nurse')
      .set('Authorization', admin())
      .send({ inherits: ['senior-nurse'] });

    expect(res).to.have.status(422);
    expect(res.body.code).to.equal('INHERITANCE_CYCLE');
  });

  it('will not delete a system role', async () => {
    const res = await chai.request(world.app).delete('/api/v1/access/roles/nurse').set('Authorization', admin());
    expect(res).to.have.status(422);
    expect(res.body.code).to.equal('SYSTEM_ROLE_PROTECTED');
  });

  it('will not delete a role that other roles inherit from', async () => {
    await createRole({ roleName: 'physio', permissions: ['patient:read'] });
    await createRole({ roleName: 'senior-physio', permissions: [], inherits: ['physio'] });

    const res = await chai.request(world.app).delete('/api/v1/access/roles/physio').set('Authorization', admin());
    expect(res).to.have.status(409);
    expect(res.body.code).to.equal('ROLE_HAS_DESCENDANTS');
  });

  it('will not delete a role someone still holds, unless forced', async () => {
    await createRole({ roleName: 'physio', permissions: ['patient:read'] });
    await chai
      .request(world.app)
      .post('/api/v1/access/role-assignments')
      .set('Authorization', admin())
      .send({ userId: world.ids.analyst, roleName: 'physio', reason: 'Covering' });

    const blocked = await chai.request(world.app).delete('/api/v1/access/roles/physio').set('Authorization', admin());
    expect(blocked).to.have.status(409);
    expect(blocked.body.code).to.equal('ROLE_IN_USE');

    const forced = await chai
      .request(world.app)
      .delete('/api/v1/access/roles/physio?force=true')
      .set('Authorization', admin());
    expect(forced).to.have.status(200);
  });

  it('reports what depends on a role before you touch it', async () => {
    await createRole({ roleName: 'physio', permissions: ['patient:read'] });
    await createRole({ roleName: 'senior-physio', permissions: [], inherits: ['physio'] });

    const res = await chai
      .request(world.app)
      .get('/api/v1/access/roles/physio/usage')
      .set('Authorization', admin());

    expect(res).to.have.status(200);
    expect(res.body.descendants).to.deep.equal(['senior-physio']);
    expect(res.body.isSystem).to.equal(false);
  });

  it('a doctor cannot create roles — that needs access.matrix:manage', async () => {
    const res = await createRole({ roleName: 'physio', permissions: ['patient:read'] }, authHeader(world.users.drHouse));
    expect(res).to.have.status(403);
  });
});

/* ------------------------------------------------------------------ *
 * Privilege escalation guards
 * ------------------------------------------------------------------ */

describe('RBAC API — escalation guards', () => {
  let world;
  beforeEach(async () => {
    world = buildWorld();
    // A role-administrator who is NOT unscoped.
    world.repository.setRole('role-admin', {
      permissions: ['patient:read', 'access.matrix:manage'],
      unscoped: false,
      canGrant: false
    });
    world.roleAdmin = world.repository.addUser({
      fullname: 'Role Admin',
      email: 'roleadmin@guardian.test',
      roleName: 'role-admin'
    });
  });

  it('a non-unscoped role administrator cannot mint an unscoped role', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', authHeader(world.roleAdmin))
      .send({ roleName: 'superuser', permissions: ['patient:read'], unscoped: true });

    expect(res).to.have.status(403);
    expect(res.body.code).to.equal('UNSCOPED_FORBIDDEN');
  });

  it('nor make an existing role unscoped', async () => {
    const res = await chai
      .request(world.app)
      .put('/api/v1/access/roles/nurse')
      .set('Authorization', authHeader(world.roleAdmin))
      .send({ unscoped: true });

    expect(res).to.have.status(403);
    expect(res.body.code).to.equal('UNSCOPED_FORBIDDEN');
  });

  it('nor hand an unscoped role to somebody', async () => {
    const res = await chai
      .request(world.app)
      .post('/api/v1/access/role-assignments')
      .set('Authorization', authHeader(world.roleAdmin))
      .send({ userId: world.ids.analyst, roleName: 'admin', reason: 'Helping out' });

    expect(res).to.have.status(403);
    expect(res.body.code).to.equal('UNSCOPED_FORBIDDEN');
  });

  it('an administrator can, and it takes effect immediately', async () => {
    const before = await chai.request(world.app).get(RECORD(world.ids.bob)).set('Authorization', authHeader(world.users.analyst));
    expect(before).to.have.status(403);

    const assigned = await chai
      .request(world.app)
      .post('/api/v1/access/role-assignments')
      .set('Authorization', authHeader(world.users.admin))
      .send({ userId: world.ids.analyst, roleName: 'admin', reason: 'Temporary system administration' });

    expect(assigned).to.have.status(201);
    expect(assigned.body.effectiveRoles).to.have.members(['analyst', 'admin']);

    const after = await chai.request(world.app).get(RECORD(world.ids.bob)).set('Authorization', authHeader(world.users.analyst));
    expect(after).to.have.status(200);
    expect(after.body.authorisedBy).to.equal('ALLOW_ROLE_UNSCOPED');
  });
});

/* ------------------------------------------------------------------ *
 * Multi-role membership
 * ------------------------------------------------------------------ */

describe('RBAC API — multi-role membership', () => {
  let world;
  beforeEach(() => { world = buildWorld(); });

  const admin = () => authHeader(world.users.admin);

  async function assign(userId, roleName, extra = {}) {
    return chai
      .request(world.app)
      .post('/api/v1/access/role-assignments')
      .set('Authorization', admin())
      .send(Object.assign({ userId, roleName, reason: 'Test assignment' }, extra));
  }

  it('a second role widens capabilities without touching the primary role', async () => {
    const denied = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.analyst));
    expect(denied).to.have.status(403);

    await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', admin())
      .send({ roleName: 'auditor', permissions: ['access.audit:read'] });

    const assigned = await assign(world.ids.analyst, 'auditor');
    expect(assigned).to.have.status(201);
    expect(assigned.body.effectiveRoles).to.have.members(['analyst', 'auditor']);

    const allowed = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.analyst));
    expect(allowed).to.have.status(200);

    // Primary role is untouched.
    const explained = await chai
      .request(world.app)
      .get(`/api/v1/access/users/${world.ids.analyst}/roles`)
      .set('Authorization', admin());
    expect(explained.body.primaryRole).to.equal('analyst');
  });

  it('an inherited role brings its parent capabilities with it', async () => {
    await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', admin())
      .send({ roleName: 'senior-nurse', permissions: ['patient.prescription:write'], inherits: ['nurse'] });

    await assign(world.ids.analyst, 'senior-nurse');

    const explained = await chai
      .request(world.app)
      .get(`/api/v1/access/users/${world.ids.analyst}/roles`)
      .set('Authorization', admin());

    // From senior-nurse itself, from nurse via inheritance, and from analyst.
    expect(explained.body.capabilities).to.include('patient.prescription:write');
    expect(explained.body.capabilities).to.include('patient.log:write');
    expect(explained.body.capabilities).to.include('patient.vitals:read');

    const seniorNurse = explained.body.perRole.find((entry) => entry.roleName === 'senior-nurse');
    expect(seniorNurse.inheritanceChain).to.deep.equal(['senior-nurse', 'nurse']);
  });

  it('refuses to assign a role the user already holds', async () => {
    const res = await assign(world.ids.nurseJoy, 'nurse');
    expect(res).to.have.status(409);
    expect(res.body.code).to.equal('ALREADY_HELD');
  });

  it('refuses an unknown role', async () => {
    const res = await assign(world.ids.analyst, 'ghost');
    expect(res).to.have.status(404);
    expect(res.body.code).to.equal('ROLE_NOT_FOUND');
  });

  it('an expired assignment stops counting with nobody touching it', async () => {
    world.repository.addRoleAssignment({
      user: world.ids.analyst,
      roleName: 'admin',
      validFrom: new Date(Date.now() - 7200000),
      validUntil: new Date(Date.now() - 3600000)
    });

    const res = await chai.request(world.app).get(RECORD(world.ids.bob)).set('Authorization', authHeader(world.users.analyst));
    expect(res).to.have.status(403);
  });

  it('a future-dated assignment does not apply yet', async () => {
    world.repository.addRoleAssignment({
      user: world.ids.analyst,
      roleName: 'admin',
      validFrom: new Date(Date.now() + 3600000)
    });

    const res = await chai.request(world.app).get(RECORD(world.ids.bob)).set('Authorization', authHeader(world.users.analyst));
    expect(res).to.have.status(403);
  });

  it('removing the assignment removes the capability', async () => {
    await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', admin())
      .send({ roleName: 'auditor', permissions: ['access.audit:read'] });

    const assigned = await assign(world.ids.analyst, 'auditor');
    expect(await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.analyst))).to.have.status(200);

    const removed = await chai
      .request(world.app)
      .delete(`/api/v1/access/role-assignments/${assigned.body.assignment.id}`)
      .set('Authorization', admin())
      .send({ reason: 'Cover ended' });

    expect(removed).to.have.status(200);
    expect(removed.body.effectiveRoles).to.deep.equal(['analyst']);

    const after = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', authHeader(world.users.analyst));
    expect(after).to.have.status(403);
  });

  it('records role assignment and removal in the audit log', async () => {
    await chai
      .request(world.app)
      .post('/api/v1/access/roles')
      .set('Authorization', admin())
      .send({ roleName: 'auditor', permissions: ['access.audit:read'] });

    const assigned = await assign(world.ids.analyst, 'auditor');
    await chai
      .request(world.app)
      .delete(`/api/v1/access/role-assignments/${assigned.body.assignment.id}`)
      .set('Authorization', admin())
      .send({ reason: 'Done' });

    const audit = await chai.request(world.app).get('/api/v1/access/audit').set('Authorization', admin());
    const events = audit.body.entries.map((entry) => entry.event);

    expect(events).to.include('role.created');
    expect(events).to.include('role.assigned');
    expect(events).to.include('role.unassigned');
  });

  it('explains where every capability came from', async () => {
    const res = await chai
      .request(world.app)
      .get(`/api/v1/access/users/${world.ids.nurseJoy}/roles`)
      .set('Authorization', admin());

    expect(res).to.have.status(200);
    expect(res.body.effectiveRoles).to.deep.equal(['nurse']);
    expect(res.body.perRole[0].inheritanceChain).to.deep.equal(['nurse']);
    expect(res.body.warnings).to.deep.equal([]);
  });
});
