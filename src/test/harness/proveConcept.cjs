#!/usr/bin/env node
/**
 * Guardian — access-control proof harness.
 *
 *   node src/test/harness/proveConcept.cjs
 *
 * Walks a realistic scenario end to end and prints the decision matrix at each
 * step, so the model can be demonstrated in a meeting without a database, a
 * browser or a running server. Exits non-zero if any expectation fails, so it
 * doubles as a smoke test in CI.
 *
 * @author   Graeme Thomas
 * @module   guardian-access-control
 * @version  1.1.0
 */

'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gmproject';

const { createMemoryRepository, newId } = require('../../access/accessRepository.memory');
const { createAccessControlService } = require('../../access/accessControlService');

/* ---------------------------------------------------------------- *
 * Tiny terminal helpers
 * ---------------------------------------------------------------- */

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColour ? `\u001b[${code}m${text}\u001b[0m` : text);
const green = (t) => paint('32', t);
const red = (t) => paint('31', t);
const dim = (t) => paint('90', t);
const bold = (t) => paint('1', t);
const cyan = (t) => paint('36', t);

let failures = 0;

function heading(text) {
  console.log('\n' + bold(text));
  console.log(dim('─'.repeat(Math.max(text.length, 60))));
}

function pad(text, width) {
  const value = String(text);
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

/* ---------------------------------------------------------------- *
 * Scenario
 * ---------------------------------------------------------------- */

const repository = createMemoryRepository();

const ids = {
  admin: newId(),
  drHouse: newId(),
  nurseJoy: newId(),
  analyst: newId(),
  caretaker: newId(),
  alice: newId(),
  bob: newId()
};

const people = [
  ['admin', 'System Admin', 'admin'],
  ['drHouse', 'Dr House', 'doctor'],
  ['nurseJoy', 'Nurse Joy', 'nurse'],
  ['analyst', 'Data Analyst', 'analyst'],
  ['caretaker', 'Care Taker', 'caretaker']
];

people.forEach(([key, fullname, roleName]) =>
  repository.addUser({ id: ids[key], fullname, email: `${key}@guardian.test`, roleName })
);

repository.addPatient({
  id: ids.alice,
  fullname: 'Alice',
  caretaker: ids.caretaker,
  assignedNurses: [ids.nurseJoy],
  assignedDoctor: ids.drHouse
});
repository.addPatient({ id: ids.bob, fullname: 'Bob', caretaker: ids.caretaker, assignedDoctor: ids.drHouse });

/* Strict mode: nothing but an explicit grant opens a record. */
const service = createAccessControlService({
  repository,
  options: { allowRelationshipAccess: false, maskUnknownPatient: true, breakGlassMaxMinutes: 60 }
});

const subjects = [
  ['admin', 'System Admin (admin)'],
  ['drHouse', 'Dr House (doctor)'],
  ['nurseJoy', 'Nurse Joy (nurse)'],
  ['analyst', 'Data Analyst (analyst)']
];

async function decisionTable(permission) {
  console.log(dim(`  permission: ${permission}`));
  console.log(
    '  ' + pad('subject', 26) + pad('Alice', 34) + pad('Bob', 34)
  );

  for (const [key, label] of subjects) {
    const cells = [];
    for (const patientKey of ['alice', 'bob']) {
      const decision = await service.check({
        userId: ids[key],
        patientId: ids[patientKey],
        permission,
        audit: false
      });
      const mark = decision.allowed ? green('ALLOW') : red('DENY ');
      cells.push(pad(`${mark} ${dim(decision.reason)}`, 34 + (useColour ? 18 : 0)));
    }
    console.log('  ' + pad(label, 26) + cells.join(''));
  }
}

function assert(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? green('✓') : red('✗')} ${label}  ${dim(`expected ${expected}, got ${actual}`)}`);
}

async function reasonFor(userKey, patientKey, permission) {
  const decision = await service.check({
    userId: ids[userKey],
    patientId: ids[patientKey],
    permission,
    audit: false
  });
  return decision.reason;
}

async function main() {
  console.log(bold(cyan('\nGuardian — patient-scoped authorisation, proof of concept')));
  console.log(dim('Strict mode: a care relationship alone grants nothing. Only an explicit'));
  console.log(dim('grant issued by a doctor or an administrator opens a patient record.'));

  /* ---------------- Step 1 ---------------- */
  heading('1. Baseline — no grants exist anywhere');
  await decisionTable('patient:read');
  assert('analyst is denied Alice', await reasonFor('analyst', 'alice', 'patient:read'), 'DENY_NO_GRANT');
  assert('assigned nurse is denied Alice in strict mode', await reasonFor('nurseJoy', 'alice', 'patient:read'), 'DENY_NO_GRANT');
  assert('admin is unscoped', await reasonFor('admin', 'bob', 'patient:read'), 'ALLOW_ROLE_UNSCOPED');

  /* ---------------- Step 2 ---------------- */
  heading('2. Dr House authorises the analyst for Alice only');
  const issued = await service.issueGrant({
    actorId: ids.drHouse,
    subjectId: ids.analyst,
    patientId: ids.alice,
    permissions: ['patient:read', 'patient.vitals:read', 'patient.prescription:write'],
    reason: 'Falls analysis for the September safety report'
  });
  console.log(dim(`  grant ${issued.grant.id} conveys: ${issued.grant.permissions.join(', ')}`));
  console.log(dim(`  dropped above the analyst role ceiling: ${issued.droppedByRoleCeiling.join(', ') || 'none'}`));
  await decisionTable('patient:read');
  assert('analyst now reaches Alice', await reasonFor('analyst', 'alice', 'patient:read'), 'ALLOW_EXPLICIT_GRANT');
  assert('analyst still cannot reach Bob', await reasonFor('analyst', 'bob', 'patient:read'), 'DENY_NO_GRANT');
  assert(
    'grant cannot lift the analyst above their role',
    await reasonFor('analyst', 'alice', 'patient.prescription:write'),
    'DENY_ROLE_LACKS_CAPABILITY'
  );

  const scoped = await service.authorisedPatientIds({ userId: ids.analyst, permission: 'patient:read' });
  assert('list endpoint returns exactly one patient', scoped.length, 1);

  /* ---------------- Step 3 ---------------- */
  heading('3. Dr House revokes the grant');
  await service.revokeGrant({ actorId: ids.drHouse, grantId: issued.grant.id, reason: 'Report complete' });
  await decisionTable('patient:read');
  assert('access stops on revocation', await reasonFor('analyst', 'alice', 'patient:read'), 'DENY_GRANT_REVOKED');

  /* ---------------- Step 4 ---------------- */
  heading('4. A grant that has expired on its own');
  await repository.createGrant({
    subject: ids.analyst,
    patient: ids.bob,
    permissions: ['patient:read'],
    grantedBy: ids.admin,
    reason: 'Time-boxed audit window',
    validFrom: new Date(Date.now() - 7200000),
    validUntil: new Date(Date.now() - 3600000)
  });
  assert('expired grant conveys nothing', await reasonFor('analyst', 'bob', 'patient:read'), 'DENY_GRANT_EXPIRED');

  /* ---------------- Step 5 ---------------- */
  heading('5. Nurse Joy takes emergency access to Bob');
  const emergency = await service.invokeBreakGlass({
    actorId: ids.nurseJoy,
    patientId: ids.bob,
    permissions: ['patient:read'],
    reason: 'Resident unresponsive, on-call doctor unreachable',
    minutes: 30
  });
  console.log(dim(`  break-glass window closes at ${emergency.expiresAt.toISOString()}`));
  await decisionTable('patient:read');
  assert('break glass opens the record', await reasonFor('nurseJoy', 'bob', 'patient:read'), 'ALLOW_BREAK_GLASS');
  assert('and does not open any other record', await reasonFor('nurseJoy', 'alice', 'patient:read'), 'DENY_NO_GRANT');

  /* ---------------- Step 6 ---------------- */
  heading('6. RBAC — inheritance and multi-role union');

  await service.createRole({
    actorId: ids.admin,
    roleName: 'senior-nurse',
    displayName: 'Senior Nurse',
    permissions: ['patient.prescription:read'],
    inherits: ['nurse'],
    description: 'Nurse baseline plus prescription visibility'
  });
  console.log(dim('  created role senior-nurse, inheriting nurse'));

  const assigned = await service.assignRole({
    actorId: ids.admin,
    userId: ids.nurseJoy,
    roleName: 'senior-nurse',
    reason: 'Acting up while the ward lead is on leave',
    validUntil: new Date(Date.now() + 14 * 24 * 3600 * 1000)
  });
  console.log(dim(`  Nurse Joy now holds: ${assigned.effectiveRoles.join(' + ')}`));

  const explained = await service.explainRoles({ userId: ids.nurseJoy });
  explained.perRole.forEach((entry) =>
    console.log(`  ${pad(entry.roleName, 16)}${dim('chain: ' + entry.inheritanceChain.join(' -> '))}`)
  );
  assert(
    'inherited capability is present',
    explained.capabilities.includes('patient.log:write'),
    true
  );
  assert(
    'own capability is present',
    explained.capabilities.includes('patient.prescription:read'),
    true
  );
  assert(
    'union did not make her unscoped',
    explained.unscoped,
    false
  );

  /* ---------------- Step 7 ---------------- */
  heading('7. Governance — who saw what, and under whose authority');
  const audit = await service.listAudit({}, { limit: 200 });
  const counts = audit.entries.reduce((acc, entry) => {
    const key = `${entry.event}${entry.reason ? ' / ' + entry.reason : ''}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, count]) => console.log('  ' + pad(key, 48) + dim(String(count))));

  const breakGlassEntries = audit.entries.filter((entry) => entry.event === 'breakglass.invoked');
  assert('break glass is recorded', breakGlassEntries.length, 1);
  assert('grant issue is recorded', audit.entries.filter((e) => e.event === 'grant.issued').length, 1);
  assert('grant revocation is recorded', audit.entries.filter((e) => e.event === 'grant.revoked').length, 1);

  const onAlice = await service.listGrants({ patient: ids.alice });
  console.log(dim(`\n  Grants ever issued on Alice: ${onAlice.total}`));
  onAlice.grants.forEach((grant) =>
    console.log(
      `  ${pad(grant.subjectName, 18)} ${pad(grant.status, 10)} ${pad((grant.permissions || []).join(','), 34)} ${dim(grant.reason)}`
    )
  );

  /* ---------------- Result ---------------- */
  heading('Result');
  if (failures) {
    console.log(red(`  ${failures} expectation(s) failed`));
    process.exit(1);
  }
  console.log(green('  All expectations held. The mechanism behaves as designed.\n'));
}

main().catch((error) => {
  console.error(red('\nHarness failed: ' + error.stack));
  process.exit(1);
});
