# Testing emails: Swagger, recipients/content, and real Brevo sends

Author: Graeme Thomas · 2026-08-08

Three things this covers, matching the questions asked:

1. Testing every email template from Swagger, with editable recipients and content.
2. That the code was reviewed and tested.
3. Sending a real email through Brevo, using the templates.

---

## 1. Test each email from Swagger

Start the app (`docker compose up --build` or `npm start`) and open
**http://localhost:3000/swaggerDocs**. Log in first to get an admin token:

```
POST /api/v1/auth/login   →  copy the returned token
```

In Swagger, click **Authorize** (top right) and paste `Bearer <token>` (or just
the token, depending on the field). Every `/api/v1/email/*` endpoint is now
callable.

The email endpoints were enhanced so this is fully guided:

- **`POST /api/v1/email/send`** — the `template` field is now a **dropdown of all
  23 templates** (not free text). Pick one, then edit the JSON `data` object:
  - the **recipient** is `data.to`
  - the **content** is the remaining `data.*` fields (name, otp, patientName, …)
  - `provider` is a dropdown of every provider (`resend`, `brevo`, `mailersend`,
    `smtp`, `dryrun`) so you can override per request
  - `dryRun: true` renders + records without delivering
- **`GET /api/v1/email/templates`** — lists every template and the exact fields it
  accepts.
- **`GET /api/v1/email/templates/{type}/sample`** — returns a ready-made `data`
  payload for a template; paste it into `/send` and tweak.
- **`POST /api/v1/email/preview`** — renders a template to HTML/subject/text
  **without sending**; `format: "html"` returns the raw document.
- **`POST /api/v1/email/send-raw`** — fully custom `to`, `subject`, `html`, `text`,
  `cc`, `bcc`, `attachments` — for completely ad-hoc content.
- **`GET /api/v1/email/outbox`** — see what was produced (sent, dry-run, blocked,
  failed).

Example `/send` body (dry run, editable recipient + content):

```json
{
  "template": "patient-alert",
  "dryRun": true,
  "data": {
    "to": "you@example.com",
    "name": "Alex",
    "patientName": "Margaret Doyle",
    "alertType": "Fall detected",
    "severity": "critical",
    "location": "Room 12, East Wing"
  }
}
```

> There is also a richer point-and-click UI at
> **/api/v1/email/test-console** (pick a template, load sample, preview, send)
> if you prefer a form over Swagger.

---

## 2. Code review + tests

The email code was reviewed and is covered by an automated suite that runs in
about a second with no database:

```bash
npm run test:email      # 52 checks
```

What the suite proves, among other things:

- every one of the 23 templates renders from its own sample data;
- user input is HTML-escaped and `javascript:` links are stripped;
- the safety model works (address validation, allowlist, dry-run);
- attachments and the `List-Unsubscribe` header are applied;
- the Swagger `template` dropdown and provider list are generated correctly;
- the **Brevo payload is built correctly** (sender, recipient, subject, HTML body
  and headers) — verified with the network call stubbed so no key is needed;
- a real message with an attachment is delivered over a live local SMTP server.

The Brevo adapter was also checked against the installed `@getbrevo/brevo`
v2.5.0 SDK surface (`TransactionalEmailsApi`, `SendSmtpEmail`,
`sendTransacEmail`) — it matches.

---

## 3. Send a real email through Brevo

Yes — with a Brevo API key the templates send for real. Two things to set up:

1. **Verify your sender.** In Brevo → *Senders, Domains & Dedicated IPs*, verify
   either the `EMAIL_FROM` address or its whole domain. Brevo rejects mail from
   unverified senders. For a quick test you can set `EMAIL_FROM` to an address
   you've verified in Brevo.
2. **Add the key** to `.env`:

```
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxx
EMAIL_FROM=you@your-verified-domain.com
EMAIL_SENDER_NAME=Guardian Monitor
EMAIL_DRY_RUN=false
```

Then send, three ways — pick whichever suits you:

**a) One command (simplest):**

```bash
# render only, no key needed, to sanity-check first:
node scripts/send-brevo-test.js you@example.com welcome --dry

# real send via Brevo (uses the template's sample data):
npm run email:brevo:test -- you@example.com welcome
```

**b) From Swagger** — `POST /api/v1/email/send` with `"provider": "brevo"` and
`"dryRun": false`.

**c) From application code:**

```js
const { sendTemplatedEmail } = require('./src/services/emailService');
await sendTemplatedEmail('welcome',
  { to: 'you@example.com', name: 'Graeme', role: 'Admin' },
  { provider: 'brevo' });
```

After sending, check the recipient's inbox and Brevo → *Transactional → Email*
logs. If a send is rejected with a sender/domain error, that's the verification
step in (1) — not a code problem.

### Deliverability (do once per domain)

For inbox placement rather than spam, publish **SPF**, **DKIM** (the keys Brevo
gives you) and a **DMARC** record for the `EMAIL_FROM` domain. Mailpit (local)
needs none of this.
