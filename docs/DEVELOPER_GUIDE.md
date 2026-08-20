# Guardian API — developer quickstart

Author: Graeme Thomas · 2026-08-08

A short guide for developers building against the Guardian backend. It covers
the base URL, how authentication works, how to call endpoints, and how to import
the API into your tools.

## 1. Base URL and interactive docs

Run the backend (`docker compose up --build` or `npm start`). Then:

| What | URL |
| --- | --- |
| Base URL | `http://localhost:3000` |
| Swagger UI (try endpoints live) | `http://localhost:3000/swaggerDocs` |
| Redoc (readable reference) | `http://localhost:3000/redoc` |
| OpenAPI spec (machine-readable) | `http://localhost:3000/openapi.json` |

The `/openapi.json` is generated from the code, so it always matches the running
API (90+ paths). Download it to generate a client, or import it into Postman /
Insomnia. A ready-made **Postman collection** ships in the repo:
`guardian-postman-collection.json`.

## 2. Authentication (JWT bearer)

The API uses JSON Web Tokens. Get one, then send it on every protected request
as an `Authorization: Bearer <token>` header.

**Register** (public). `role` is optional; omit it or pass one of
`nurse`, `caretaker`, `doctor`, `admin`:

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"fullname":"Sam Dev","email":"sam@example.com","password":"Password123!"}'
```

**Login** (public) — returns `{ user, token }`:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sam@example.com","password":"Password123!"}'
```

**Call a protected endpoint** with the token:

```bash
TOKEN="paste-the-token-here"
curl http://localhost:3000/api/v1/patients \
  -H "Authorization: Bearer $TOKEN"
```

Notes:
- Tokens expire, so log in again when you get a `401`.
- Some accounts may need admin approval before they can log in.
- CORS is open (`*`) in this build, so browser front-ends can call it directly.

## 3. Calling from code

**JavaScript (fetch):**

```js
const BASE = 'http://localhost:3000';

async function login(email, password) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const { token } = await res.json();
  return token;
}

async function getPatients(token) {
  const res = await fetch(`${BASE}/api/v1/patients`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}
```

**Python (requests):**

```python
import requests
BASE = "http://localhost:3000"

token = requests.post(f"{BASE}/api/v1/auth/login",
                      json={"email": "sam@example.com", "password": "Password123!"}).json()["token"]

patients = requests.get(f"{BASE}/api/v1/patients",
                        headers={"Authorization": f"Bearer {token}"}).json()
```

## 4. Import the Postman collection

1. In Postman: **Import → File →** `guardian-postman-collection.json`.
2. Set the collection variable `baseUrl` if not `http://localhost:3000`.
3. Open **Authentication → User login**, put in your credentials, and **Send** —
   a test script saves the returned token into the `token` collection variable
   automatically.
4. Every other request now sends that token as a Bearer token. Public auth
   requests are marked "No Auth" so they work before you have a token.

## 5. Access model (who can call what)

- **Public:** `POST /auth/register`, `/auth/login`, `/auth/send-pin`,
  `/auth/verify-pin`, `/auth/reset-password-request`, `/auth/reset-password`.
- **Authenticated (any valid token):** most read/profile endpoints.
- **Role-gated:** many patient/care/admin endpoints require a specific role
  (`nurse`, `caretaker`, `doctor`, `admin`). A `403` means your role isn't
  permitted; a `401` means the token is missing/expired.
- **Admin-only:** the entire **email** API (`/api/v1/email/*`).

Every endpoint's required role and request/response shape is documented inline in
Swagger UI and the OpenAPI spec.

## 6. The email API (highlights for integrators)

All email endpoints require an **admin** token. The most useful ones:

- `GET /api/v1/email/templates` — list templates and their fields.
- `POST /api/v1/email/preview` — render a template to HTML/subject/text without
  sending. Great for building UIs.
- `POST /api/v1/email/send` — send a templated email. `data.to` is the recipient;
  the other `data.*` fields are the content. `dryRun: true` renders + records
  without delivering. `provider` overrides the transport for that request.
- `GET /api/v1/email/inbox` — browse everything the tool has sent (persisted).

In Swagger, the `template` field on send/preview is a dropdown of every template.

## 7. Keeping the spec and collection up to date

They are generated from the code, so after you add or change endpoints, run:

```bash
npm run openapi:generate    # refreshes src/openapi.json (served at /openapi.json)
npm run postman:generate    # refreshes guardian-postman-collection.json
```

Because both read the same source as the live Swagger UI, they never drift from
the running API.

## 8. Error format

Errors return a JSON body with a `message` and/or `error` field and an
appropriate status code (`400` validation, `401` auth, `403` role, `404` not
found, `5xx` server). Validation errors on some endpoints also include a
`fields` array naming what was missing or invalid.
