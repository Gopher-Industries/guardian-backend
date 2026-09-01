# Getting started — Guardian backend (with the email module)

This is the complete "install and run" guide. There are two ways to run it:
**Docker (easiest)** or **local Node + MongoDB**. Both are below.

---

## 1. What you need to install

| Tool | Version | Why |
| --- | --- | --- |
| **Node.js** | 18 or newer (tested on 20/22) | runs the backend |
| **npm** | 9+ (ships with Node) | installs dependencies |
| **MongoDB** | 6+ | the database. Use Docker, a local install, or a free MongoDB Atlas cluster |
| **Docker + Docker Compose** | optional | one-command run of app + MongoDB + Mailpit |
| **A Brevo account + API key** | optional | only needed to send **real** email via Brevo |

All Node package dependencies (Express, Mongoose, `@getbrevo/brevo`,
`nodemailer`, etc.) install automatically with `npm install` — you don't install
them by hand.

---

## 2. Option A — Run everything with Docker (recommended)

From the project folder:

```bash
docker compose up --build
```

This starts three containers:

| Service | URL |
| --- | --- |
| Backend API | http://localhost:3000 |
| MongoDB | localhost:27018 |
| Mailpit (local mail inbox) | http://localhost:8025 |

The database is seeded automatically on first boot (roles + sample users).
Open http://localhost:3000/swaggerDocs to explore the API.

Stop with `Ctrl+C`, or `docker compose down` (add `-v` to also wipe the DB).

---

## 3. Option B — Run locally with Node

```bash
# 1. Install dependencies
npm install

# 2. Make sure MongoDB is running and reachable. Easiest:
docker compose up -d mongo        # starts just MongoDB on localhost:27018
#   (or use your own MongoDB / MongoDB Atlas and set MONGODB_URI below)

# 3. Start the server
npm start                          # http://localhost:3000
```

`npm start` uses nodemon, so it restarts on file changes.

---

## 4. Configure `.env`

A ready-to-use `.env` is included. The values that matter:

```ini
PORT=3000
NODE_ENV=development

# Database — pick one:
MONGODB_URI=mongodb://admin:password@mongo:27017/guardian?authSource=admin      # docker compose
# MONGODB_URI=mongodb://admin:password@localhost:27018/guardian?authSource=admin # local node + docker mongo
# MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/guardian                     # MongoDB Atlas

# Auth — change before any real deployment
JWT_SECRET=change-me-to-a-long-random-dev-secret

# Email provider (this build is focused on Brevo)
EMAIL_PROVIDER=brevo
BREVO_API_KEY=            # paste your Brevo key (xkeysib-...) to send real email
EMAIL_FROM=no-reply@your-verified-domain.com   # must be verified in Brevo
```

> **No Brevo key yet?** The app still runs. To try email without a key, either
> set `EMAIL_PROVIDER=dryrun` (renders + logs, never sends) or
> `EMAIL_PROVIDER=smtp` with `SMTP_HOST=mailpit` (or `localhost`) to catch mail
> in Mailpit at http://localhost:8025. Switch back to `brevo` when your key is in.

---

## 5. Get an admin token and send your first email

The email endpoints require an **admin**. Create one, then log in:

```bash
# 1. Register an admin (registration needs no email provider)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"fullname":"Admin User","email":"admin@example.com","password":"Password123!","role":"admin"}'

# 2. Log in to get a token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Password123!"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

# 3. (Brevo) confirm your API key works — sends nothing
curl -X POST http://localhost:3000/api/v1/email/verify-connection \
  -H "Authorization: Bearer $TOKEN"

# 4. Send an email: just a destination + an option (template)
curl -X POST http://localhost:3000/api/v1/email/send-option \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to":"someone@example.com","option":"welcome"}'
```

Prefer clicking? Open **http://localhost:3000/swaggerDocs**, press **Authorize**,
paste the token, and use `POST /api/v1/email/send-option` (the `option` field is
a dropdown). There's also a browser console at
`http://localhost:3000/api/v1/email/test-console` and a sent-mail inbox at
`http://localhost:3000/api/v1/email/inbox-view`.

The seeded (non-admin) users `alice@guardian.com`, `jane@guardian.com`, etc. all
use password `Password123!` if you want to test other roles.

---

## 6. Run the tests

```bash
# Email suite — no database, no API keys needed (77 checks, ~2s)
npm run test:email

# Full suite — self-provisions an in-memory MongoDB automatically
npm test
```

`npm test` downloads a MongoDB binary the first time (cached afterwards). To use
your own database instead, set `TEST_MONGODB_URI=...` before running.

---

## 7. Handy URLs

| What | URL |
| --- | --- |
| API home | http://localhost:3000/ |
| Swagger UI | http://localhost:3000/swaggerDocs |
| Redoc | http://localhost:3000/redoc |
| OpenAPI spec | http://localhost:3000/openapi.json |
| Email test console | http://localhost:3000/api/v1/email/test-console |
| Sent inbox (browser) | http://localhost:3000/api/v1/email/inbox-view |
| Mailpit (dev mail catcher) | http://localhost:8025 |

---

## 8. Troubleshooting

- **"Email is not configured correctly" on a send** — you're on
  `EMAIL_PROVIDER=brevo` with no `BREVO_API_KEY`. Add the key, or switch to
  `dryrun`/`smtp` (see step 4).
- **Brevo rejects the message (sender/domain)** — verify `EMAIL_FROM` in Brevo
  (*Senders, Domains & Dedicated IPs*). This is a Brevo setup step, not a bug.
- **Can't connect to MongoDB** — check `MONGODB_URI` matches how you're running
  (compose host `mongo:27017` vs local `localhost:27018`).
- **403 on `/api/v1/email/...`** — your token isn't an admin. Register with
  `"role":"admin"` (step 5).
- **Port already in use** — change `PORT` in `.env`, or stop the process using
  3000 / 27018 / 8025.

More detail: `docs/BREVO_EMAIL_API.md` (every email endpoint explained),
`docs/TESTING_AND_ROBUSTNESS.md`, and `docs/architecture/` (diagrams).
