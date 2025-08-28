# Audit Logging System — Team Guide & Test Cases

> This document includes reference for how our **AuditLog** works, how to **test** it, and how to **extend** it safely.  
> **Scope:** Auth, authorization (RBAC), and task operations, extensible to other domains (patients, care plans, tickets) without changing existing behavior.

---

## 1. What We Log (and Why)

We store **permanent** audit records of sensitive events to support:
- **Security monitoring** (e.g., failed logins, token issues)
- **Compliance** (provable access/change history)
- **Operational debugging** (who did what, when, where)
- **Analytics & notifications** (optionally trigger alerts for critical events)

**Categories & sample actions**
- `auth`: `login_success`, `login_failed`, `login_locked`, `token_invalid`, `token_expired`
- `authorization`: `permission_denied`, `permission_check_failed`
- `tasks`: `task_created`, `task_updated`, `task_deleted`

---

## 2. Log Structure (Schema & Fields)

**Collection:** `auditlogs`  
**Indexes:** recommended on `createdAt`, `category`, `action` 

```jsonc
{
  "_id": "ObjectId",
  "category": "auth",                        // logical group
  "action": "login_failed",                  // specific event
  "actor": "66bd9b1c2e3f1b4d9a123456",      // userId (if known)
  "status": "failure",                       // "success" | "failure"
  "meta": { "reason": "invalid_credentials" }, // compact context only
  "ipAddress": "203.0.113.24",
  "userAgent": "PostmanRuntime/7.39.0",
  "createdAt": "2025-08-15T10:00:00.000Z"
}
````

**Field notes**

* `actor`: omit if unauthenticated (e.g., unknown email during login).
* `meta`: only compact keys (e.g., `reason`, `resourceId`, `role`, `taskId`). Never raw secrets.

---

## 3. Where Logs Are Emitted

Refers to typical placements in this project:

* **Auth**

  * `src/controllers/userController.js` → on login success/failure/lock
  * `src/middleware/verifyToken.js` → `token_invalid`, `token_expired`

* **Authorization (RBAC)**

  * `src/middleware/verifyRole.js` → `permission_denied`, `permission_check_failed`

* **Tasks**

  * `src/controllers/adminController.js` → `task_created`, `task_updated`, `task_deleted`

* **Admin listing (read-only)**

  * `GET /api/v1/admin/audit-logs` in `src/routes/auditLogs.js` (no user-facing UI)

---

## 4. How to Add a New Log 

1. **Pick a category**: `auth`, `authorization`, `tasks`, or introduce a new one (`patient`, `tickets`, …).
2. **Name an action** (e.g., `patient_created`, `ticket_assigned`).
3. **Emit log** using the async logger:

```js
const { audit } = require('../utils/audit'); // helper wraps model insert

audit({
  category: 'auth',
  action: 'login_failed',
  status: 'failure',
  actor: user?._id,                          // optional
  meta: { reason: 'invalid_credentials' },
  req                                         // pass req to capture ip/user-agent
});
```

> \[!TIP]
> The helper should be **fire-and-forget** (e.g., `setImmediate`) so logging never blocks the main request path.

---

## 5. Test Cases for Common Log Types

### 5.1 Postman Flow (Manual QA)

> Use **Postman** for calls and **MongoDB Compass** to confirm records.
> Create a Postman **Environment** with:
>
> * `baseUrl` = `http://localhost:3000`
> * `adminToken` / `nurseToken` (set after login)

---

#### 1) Register Users (skip if they exist)

* **POST** `{{baseUrl}}/api/v1/auth/register`
  Headers: `Content-Type: application/json`

**Admin**

```json
{ "fullname": "Admin Audit", "email": "admin.audit@example.com", "password": "AdminPass123!", "role": "admin" }
```

**Nurse**

```json
{ "fullname": "Nurse Audit", "email": "nurse.audit@example.com", "password": "NursePass123!", "role": "nurse" }
```

* **Expected:** `201 Created` (or `400` if already exists)

---

#### 2) Login & store tokens

* **POST** `{{baseUrl}}/api/v1/auth/login`
  Headers: `Content-Type: application/json`

**Admin body**

```json
{ "email": "admin.audit@example.com", "password": "AdminPass123!" }
```

**Postman → Tests**

```js
pm.test("Status 200", () => pm.response.to.have.status(200));
pm.environment.set("adminToken", pm.response.json().token);
```

**Nurse body**

```json
{ "email": "nurse.audit@example.com", "password": "NursePass123!" }
```

**Postman → Tests**

```js
pm.test("Status 200", () => pm.response.to.have.status(200));
pm.environment.set("nurseToken", pm.response.json().token);
```

* **Expected:** `200 OK` and audit `auth: login_success`

---

#### 3) Auth failures

**Unknown email**

* **POST** `/api/v1/auth/login`

```json
{ "email": "nouser@example.com", "password": "SomePass123!" }
```

* **Expected:** `400` and audit `auth: login_failed`

**Wrong password (nurse)** — run \~5 times

```json
{ "email": "nurse.audit@example.com", "password": "WrongPass!" }
```

* **Expected:** multiple `400` (login\_failed), then `400` lock → `auth: login_locked`

---

#### 4) Token errors

**Missing/Bad Bearer**

* **GET** `{{baseUrl}}/api/v1/alerts` (no `Authorization` or malformed)
* **Expected:** `401` or `400`, audit `auth: token_invalid`

**Invalid signature**

* **GET** `{{baseUrl}}/api/v1/alerts`

  * Headers: `Authorization: Bearer invalid.invalid.invalid`
* **Expected:** `400`, audit `auth: token_invalid`

---

#### 5) RBAC (permission denied)

**Nurse** requests admin-only listing:

* **GET** `{{baseUrl}}/api/v1/admin/audit-logs?limit=2`
  Headers: `Authorization: Bearer {{nurseToken}}`
* **Expected:** `403`, audit `authorization: permission_denied`

---

#### 6) Admin lists audit logs

* **GET** `{{baseUrl}}/api/v1/admin/audit-logs?limit=10`
  Headers: `Authorization: Bearer {{adminToken}}`
* **Expected:** `200` with `{ page, limit, total, items[] }`

**Filter examples:**

* `?category=auth&action=login_failed&limit=5`
* `?category=authorization&action=permission_denied&limit=5`

---

#### 7) (Optional) Task events

**If task routes are mounted**

* **POST** `/api/v1/admin/tasks` → `task_created`
* **PUT** `/api/v1/admin/tasks/:taskId` → `task_updated`
* **DELETE** `/api/v1/admin/tasks/:taskId` → `task_deleted`
  Headers: `Authorization: Bearer {{adminToken}}`

---

### 5.2 Verifying in MongoDB

**MongoDB Compass**

1. Open the database used by the app.
2. Select `auditlogs`.
3. **Sort** by `createdAt` **descending**.
4. Confirm expected `category`, `action`, `status`, and `actor`.

---

## 6. Querying Audit Logs (Admin Endpoint)

**Route:** `GET /api/v1/admin/audit-logs` (admin only)

**Response**

```json
{
  "page": 1,
  "limit": 20,
  "total": 123,
  "items": "array of audit logs"
}
```

---

## 7. Retention, Indexing & Operations

* **Retention:** keep permanent by default; if growth becomes an issue, introduce **archival** (e.g., move >90 days to `auditlogs_archive`).

* **Indexes (recommended):**

  * `{ createdAt: -1 }`
  * `{ category: 1, action: 1, createdAt: -1 }`

* **Throughput:** the logger is **async** (fire-and-forget) to keep latency negligible.

---

