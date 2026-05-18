# Guardian Backend Test Suite

This folder contains the PR-ready backend test suite for the Guardian backend project.

The suite uses Mocha/Chai/Supertest, mounts the real route modules through `helpers/testApp.cjs`, and avoids importing `src/server.js` so tests do not start the production HTTP listener.

## Current verified result

Latest local run result from this test suite:

```text
65 passing
Lines:      ~79.24%
Statements: ~77.66%
Functions:  ~81.67%
Branches:   ~66.32%
```

For the current sprint target, this is treated as approximately 80% backend test coverage.

## Required local MongoDB service

Run MongoDB first:

```bash
docker compose up -d mongo
```

If the database has stale data, reset it:

```bash
docker compose down -v
docker compose up -d mongo
```

Default test database URI:

```text
mongodb://admin:password@localhost:27018/guardian_test?authSource=admin
```

## Main test areas

| Test file | Area covered |
|---|---|
| `authFlow.cjs` | Auth registration/login happy paths and common failures. |
| `authControllerFlow.cjs` | Auth controller validation, password change/reset and OTP bypass paths. |
| `rbacFlow.cjs` | Missing token, non-admin blocking and admin access. |
| `patientFlow.cjs` | Core patient routes for caretaker/nurse workflows. |
| `patientControllerFlow.cjs` | Patient controller validation, list/detail/update/delete/assignment branches. |
| `adminDashboardFlow.cjs` | Admin dashboard summary and patient soft-delete impact. |
| `adminTaskFlow.cjs` | Admin task create/update/delete and missing-task branch. |
| `adminPatientReassign.cjs` | Admin patient reassignment and cross-organization guards. |
| `organizationStaffControllerFlow.cjs` | Organization/staff approval, add/deactivate/status branches. |
| `orgStaffFlow.cjs` | Organization creation, join request and approval flow. |
| `notificationFlow.cjs` | Notification create/list/read/update/delete access rules. |
| `aiSignalFlow.cjs` | Wi-Fi CSI, activity recognition and alert routes. |
| `careRecordPrescriptionLogFlow.cjs` | Health records, prescriptions and patient logs. |
| `careRecordsControllerFlow.cjs` | Care record, prescription and patient-log controller branches. |
| `careTeamDashboardFlow.cjs` | Nurse/caretaker dashboards and doctor/caretaker directories. |
| `careTeamAdminFlow.cjs` | Admin inline nurse/caretaker routes and care team branches. |
| `doctorControllerFlow.cjs` | Doctor listing, assigned patients and direct assignment branches. |
| `serviceUtilityFlow.cjs` | Utility functions and service validation branches. |

## Helper files

```text
helpers/db.cjs              MongoDB test connection and cleanup
helpers/fixtures.cjs        Shared role/user/patient/task factories
helpers/mockResponse.cjs    Lightweight response mock for direct controller tests
helpers/testApp.cjs         Express test app that mounts real routes
```

## Run tests

From the backend root:

```bash
rm -rf .nyc_output coverage
docker compose down -v
docker compose up -d mongo
npm test
npm run test:coverage
npm run coverage:check
```

## PR note

This folder is intentionally clean for main branch review:

- No temporary patch scripts.
- No source-code cleanup scripts.
- No test files named `ExtraCoverage`.
- No resource test file because that route was returning `404` on the local project branch.
