# Guardian Backend Test Folder

This `src/test` folder is designed to work with the existing Guardian backend Mocha setup:

```bash
npm test
```

The existing `adminPatientReassign.cjs` file is kept as a collaborative project test file. The additional files extend the coverage instead of replacing it.

## Required local MongoDB service

The existing project test uses MongoDB at local port `27018`. Start Mongo before running the full suite:

```bash
docker compose up -d mongo
npm test
```

If the local test database has stale data or auth issues, reset it:

```bash
docker compose down -v
docker compose up -d mongo
npm test
```

## Coverage Matrix

| Test file | Main area covered | What it proves |
|---|---|---|
| `adminPatientReassign.cjs` | Admin patient assignment | Existing collaborative coverage for reassigning caretaker, nurse, doctor, cross-org blocking and reverse-link consistency. |
| `authFlow.cjs` | Authentication | Registration, duplicate email rejection, invalid role rejection, login success, failed login attempt incrementing. |
| `patientFlow.cjs` | Patient workflows | Freelance caretaker patient creation, caretaker-scoped listing, assigned nurse update, organization-member blocking for independent routes. |
| `rbacFlow.cjs` | Role-based access control | Missing token rejection, non-admin blocking, admin access to protected dashboard routes. |
| `notificationFlow.cjs` | Notifications | Create notification, list authenticated-user notifications, mark own notification as read, block access to other-user notifications, required-field validation. |
| `adminDashboardFlow.cjs` | Dashboard APIs | Admin dashboard summary totals, active patient count, staff count, task totals and completion rate. |
| `adminTaskFlow.cjs` | Admin task APIs | Create, update and delete task through protected admin APIs, plus 404 handling for missing task updates. |

## Folder structure

```text
src/test/
├── README.md
├── adminDashboardFlow.cjs
├── adminPatientReassign.cjs
├── adminTaskFlow.cjs
├── authFlow.cjs
├── notificationFlow.cjs
├── patientFlow.cjs
├── rbacFlow.cjs
└── helpers/
    ├── db.cjs
    ├── fixtures.cjs
    ├── mockResponse.cjs
    └── testApp.cjs
```

## Notes for project collaboration

- Do not delete `adminPatientReassign.cjs`; it can remain as the first team/collaboration test file.
- The new test files use shared helpers, but the existing `adminPatientReassign.cjs` can keep its own setup.
- `helpers/testApp.cjs` mounts the real route modules without importing `src/server.js`, so the tests avoid starting the production HTTP server.
- `helpers/db.cjs` uses the same MongoDB URI pattern as the existing test file, which keeps the local and CI setup consistent.
