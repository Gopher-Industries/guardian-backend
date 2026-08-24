# Guardian email API — Brevo edition, with per-endpoint explanations

Author: Graeme Thomas · 2026-08-08

This build is focused on **Brevo**. With a Brevo API key set, you pass a
**destination address** and an **email option** (which template to use) and the
message is sent through Brevo's transactional email API. Every endpoint is
explained below with what it does, its parameters, and an example.

---

## Setup (make it live in 3 steps)

1. **Get a Brevo API key** — in Brevo: *SMTP & API → API Keys → Generate*. It
   starts with `xkeysib-`.
2. **Verify your sender** — in Brevo: *Senders, Domains & Dedicated IPs*, verify
   the address (or domain) you'll send from. Brevo rejects unverified senders.
3. **Configure `.env`:**

   ```
   EMAIL_PROVIDER=brevo
   BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxx
   EMAIL_FROM=you@your-verified-domain.com
   EMAIL_SENDER_NAME=Guardian Monitor
   EMAIL_DRY_RUN=false
   ```

That's all — the API key drives everything. Without a key (and with dry-run
off) the send endpoints return a clear configuration error instead of failing
silently.

## How the key drives it

`EMAIL_PROVIDER=brevo` selects the Brevo adapter. On each send the service reads
`BREVO_API_KEY`, builds the message from the chosen template, and calls Brevo's
`sendTransacEmail`. You can confirm the key is valid at any time with
`POST /verify-connection` (it calls Brevo's account endpoint — no email sent).

## Authentication

Every `/api/v1/email/*` endpoint requires an **admin** bearer token. Get one:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"..."}' | jq -r .token)
```

Send it as `Authorization: Bearer $TOKEN` on every call below.

---

## The endpoints

### 1. `POST /api/v1/email/send-option` — the simple send (destination + option)

**What it does:** The easiest way to send. You give a **destination** (`to`) and
an **email option** (`option`, a template key). Any fields the template needs
that you don't supply are filled from that template's sample data, so a minimal
request always produces a valid email. Sends via Brevo.

**Body:** `to` (required), `option` (required, see the options table), `data`
(optional field overrides), `provider` (optional override), `dryRun` (optional).

**Example — send a welcome email with just two parameters:**

```bash
curl -X POST http://localhost:3000/api/v1/email/send-option \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to":"someone@example.com","option":"welcome"}'
```

**Example — with your own content:**

```bash
curl -X POST http://localhost:3000/api/v1/email/send-option \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to":"nurse@example.com","option":"otp","data":{"name":"Alex","otp":"482913"}}'
```

**Response (202):**

```json
{ "message": "Email accepted for delivery.", "status": "sent",
  "provider": "brevo", "messageId": "<...>", "to": ["someone@example.com"],
  "subject": "Welcome to Guardian Monitor" }
```

### 2. `POST /api/v1/email/verify-connection` — check the API key

**What it does:** Confirms Brevo is reachable and your key is valid by fetching
your Brevo account. **Sends nothing.** Use it before you debug a send.

**Body:** optional `provider` (defaults to the configured one).

```bash
curl -X POST http://localhost:3000/api/v1/email/verify-connection \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `{ "ok": true, "provider": "brevo", "email": "you@...", "company": "..." }`
on success, or `{ "ok": false, "error": "..." }` if the key is wrong.

### 3. `GET /api/v1/email/config` — see the effective settings

**What it does:** Shows the resolved email configuration (provider, sender,
safety switches, validation state). **API keys are redacted** — it never returns
your Brevo key. Good for confirming the server picked up your `.env`.

```bash
curl http://localhost:3000/api/v1/email/config -H "Authorization: Bearer $TOKEN"
```

### 4. `GET /api/v1/email/templates` — list the email options

**What it does:** Returns every template ("option") and the fields each one
accepts. This is how you discover what to put in `data`.

```bash
curl http://localhost:3000/api/v1/email/templates -H "Authorization: Bearer $TOKEN"
```

### 5. `GET /api/v1/email/templates/{option}/sample` — a ready-made payload

**What it does:** Returns realistic sample `data` for one option — copy it,
change the values, and send.

```bash
curl http://localhost:3000/api/v1/email/templates/patient-alert/sample \
  -H "Authorization: Bearer $TOKEN"
```

### 6. `POST /api/v1/email/preview` — render without sending

**What it does:** Builds the subject, HTML and plain-text for an option and
returns them **without contacting Brevo**. Ideal for building a UI or checking
wording. `format: "html"` returns the raw HTML document (for an iframe).

**Body:** `template` (option), `data`, optional `format`.

```bash
curl -X POST http://localhost:3000/api/v1/email/preview \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"template":"welcome","data":{"to":"a@b.com","name":"Sam"}}'
```

### 7. `POST /api/v1/email/send` — full templated send

**What it does:** Like `send-option`, but you pass the recipient inside `data.to`
and provide the fields yourself (no sample auto-fill). Use it when you always
supply full data.

**Body:** `template`, `data` (must include `to`), optional `provider`, `dryRun`.

```bash
curl -X POST http://localhost:3000/api/v1/email/send \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"template":"patient-alert","data":{"to":"carer@example.com","name":"Alex","patientName":"Margaret Doyle","alertType":"Fall detected","severity":"critical","location":"Room 12"}}'
```

### 8. `POST /api/v1/email/send-raw` — fully custom email

**What it does:** Sends an email with an explicit `subject`, `html`/`text`, and
optional `cc`, `bcc`, `replyTo`, `attachments` — no template. For one-off
messages.

```bash
curl -X POST http://localhost:3000/api/v1/email/send-raw \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to":"a@b.com","subject":"Hello","html":"<p>Hi there</p>"}'
```

### 9. `POST /api/v1/email/send-bulk` — one message per recipient

**What it does:** Sends the same option to many recipients, one email each, and
returns a per-recipient result (one bad address doesn't fail the batch).

**Body:** `template`, `recipients` (array of addresses or objects), `data`.

```bash
curl -X POST http://localhost:3000/api/v1/email/send-bulk \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"template":"daily-report","recipients":["a@b.com","c@d.com"],"data":{"reportDate":"08 August 2026"}}'
```

### 10. `POST /api/v1/email/test` — built-in smoke test

**What it does:** Sends the `render-check` template (which exercises every layout
component) to one address. Quickest way to confirm end-to-end delivery through
Brevo.

```bash
curl -X POST http://localhost:3000/api/v1/email/test \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to":"you@example.com"}'
```

### 11. Sent inbox — `GET /api/v1/email/inbox` (+ `/stats`, `/{id}`, `/{id}/html`, `DELETE`)

**What it does:** A persisted history of everything sent (delivered, dry-run,
blocked, failed), stored in MongoDB. `GET /inbox` lists with filters
(`status`, `template`, `to`, `q`, paging); `/inbox/stats` gives counts;
`/inbox/{id}` returns one message with its body; `/inbox/{id}/html` returns just
the HTML; `DELETE /inbox` clears it.

```bash
curl "http://localhost:3000/api/v1/email/inbox?status=sent&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### 12. `GET /api/v1/email/outbox` (+ `/{id}`, `/{id}/html`, `DELETE`)

**What it does:** The same idea as the inbox but **in-memory** (fast, resets on
restart). The persisted inbox (11) is usually what you want; the outbox is handy
for the most recent activity without a database.

### 13. Browser pages — `GET /inbox-view` and `GET /test-console`

**What they do:** Read-only HTML pages. `/inbox-view` browses the sent inbox;
`/test-console` lets you pick an option, edit fields, preview, and send from the
browser. Both ask you to paste an admin token; they're disabled in production
unless explicitly enabled.

---

## Email options (template keys)

Use any of these as the `option` (or `template`) value. Fields you omit are
filled from the option's sample (for `send-option`) — call
`GET /templates/{option}/sample` to see them.

`welcome`, `verify-email`, `account-approved`, `staff-invite`,
`password-reset`, `otp`, `password-expiry-reminder`,
`patient-alert`, `task-assigned`, `care-plan-updated`, `daily-report`,
`appointment-reminder`, `appointment-confirmed`, `appointment-cancelled`,
`results-ready`, `secure-message`, `account-locked`, `suspicious-login`,
`two-factor-enabled`, `shift-reminder`, `receipt`,
`custom-message`, `render-check`.

---

## Send a real one from the command line

```bash
# render only (no key needed) to sanity-check:
node scripts/send-brevo-test.js you@example.com welcome --dry

# real send via Brevo (uses the option's sample data + your address):
npm run email:brevo:test -- you@example.com welcome
```

After sending, check the recipient inbox and Brevo → *Transactional → Email*
logs. A sender/domain rejection means the verification step in Setup, not a code
problem.

---

## Tests

```bash
npm run test:email          # 61 checks, no database, runs in ~2s
```

Brevo-specific coverage (network stubbed, so no key needed to run the tests):

- `sendByOption` fills sample fields and sends; overrides work; unknown option
  and missing destination are rejected.
- A real Brevo send builds the correct payload (sender, recipient, subject, body,
  List-Unsubscribe) and returns `status: "sent"` with the Brevo message id.
- `verify-connection` validates the key via Brevo's account endpoint and reports
  success/failure correctly.

Full delivery through the live Brevo API is exercised by the one-command script
above once your real key is in place.
