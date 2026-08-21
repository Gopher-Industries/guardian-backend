# Testing & robustness

Author: Graeme Thomas · 2026-08-08

This describes how to run the tests (they now work with zero setup) and the
robustness measures that keep the email system from failing in surprising ways.

## Running the tests

### Email suite — no database required

```bash
npm run test:email
```

Runs **77 checks** in a couple of seconds with **no MongoDB and no API keys**:

- `src/test/emailFlow.cjs` — configuration, templates, the send safety model,
  the outbox, the Brevo payload + key verification (network stubbed), the
  send-by-option flow, and a provider-failure guard.
- `src/test/emailApiNoDb.cjs` — the **entire `/api/v1/email` HTTP surface**
  driven through the real router and controller with the auth middleware stubbed,
  so every endpoint (config, templates, preview, send, send-option, send-raw,
  send-bulk, inbox, outbox, the browser pages) is exercised without a database.

Because these need no external services, they pass anywhere — CI, a fresh
clone, an exam machine.

### Full suite — self-provisioning database

```bash
npm test
```

The DB-backed suites (patients, tasks, auth, the email routes, …) now
**self-provision an in-memory MongoDB** automatically — you do **not** need
Docker or a running database. On first run the helper downloads a MongoDB
binary (cached afterwards). To point at your own database instead:

```bash
TEST_MONGODB_URI="mongodb://user:pass@host:27017/guardian_test" npm test
# or just run the local mongo and set nothing:
docker compose up -d mongo
```

If the in-memory server can't be provisioned (e.g. fully offline), the helper
prints a clear note and falls back to the conventional local mongo on `:27018`.

### Brevo-focused email routes only

```bash
npm run test:email:routes   # runs src/test/emailRoutesFlow.cjs (uses the DB helper above)
```

## What makes it robust

- **Sending never crashes the request.** Every attempt is wrapped: invalid
  addresses → `400`; allowlist blocks → `403`; provider errors → `502`; a
  provider that returns nothing is caught and reported as `502` ("no result")
  rather than throwing. Each outcome is recorded before the error is surfaced.
- **Persistence can never break sending.** Writing to the persisted inbox is
  best-effort — if MongoDB is down or absent, the write is skipped (logged) and
  the send still succeeds. The inbox API falls back to the in-memory store and
  says so via a `source` field.
- **Config validates without throwing.** Missing keys or bad settings produce
  structured errors/warnings (via `/config` and `/verify-connection`) instead of
  crashing at boot.
- **Provider SDKs load lazily.** `resend`, `@getbrevo/brevo`, `nodemailer` and
  `mailersend` are required only when used, so the app boots even if an unused
  one isn't installed.
- **Input is escaped and links are filtered.** Templates HTML-escape all
  interpolated values and reject non-`http(s)`/`mailto` URLs, so user data can't
  inject markup or `javascript:` links.
- **Docs stay accurate.** The OpenAPI spec and Postman collection are generated
  from the same source as the live Swagger UI, so they can't drift from the API.

## Continuous integration

A minimal CI step that always passes without infrastructure:

```bash
npm ci
npm run test:email      # 77 checks, no DB, no keys
```

Add `npm test` when the runner has internet access for the in-memory MongoDB
download (or a `TEST_MONGODB_URI`).
