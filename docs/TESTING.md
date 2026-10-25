# Testing the Guardian email module

Four different problems, four different tools. Work up the ladder — the cheap
layers catch most of it, and each rung tests something the one below cannot.

| Layer | What it proves | Cost |
| --- | --- | --- |
| 1. Service tests | The logic and every template are sound | seconds, no dependencies |
| 2. Side-effect tests | Real flows actually produce the right email | seconds, needs MongoDB |
| 3. Local catcher | Messages survive a real SMTP round trip | one container |
| 4. Real clients | It renders in Outlook, which is where it breaks | manual |

---

## 1. Service tests — the fast loop

```bash
npx mocha 'src/test/emailFlow.cjs' --exit
```

31 tests. No MongoDB, no API keys, no network. Covers config validation and
redaction, template rendering, HTML escaping and `javascript:` URL rejection,
the allowlist, dry run, the outbox, SMTP configuration, and backwards
compatibility of `utils/mailer.js`.

The test worth understanding is *"renders every template from its own sample
data"*. It walks the registry, so the moment you add a template it is covered
with no extra test written. Keep the `sample` values in your field metadata
realistic and this stays true.

One block is conditional. Install the optional dev dependency and it runs a
real SMTP server in-process, sends through it, and asserts on the raw wire
format:

```bash
npm install --save-dev smtp-server
```

Without it the block reports as pending rather than failing.

---

## 2. Side-effect tests — the layer most people skip

```bash
docker compose up -d mongo
npx mocha 'src/test/emailRoutesFlow.cjs' --exit
```

The failure that actually reaches production is rarely "the template is wrong".
It is "the code path never called the mailer" or "it emailed the wrong person".
The outbox exists so you can assert on that directly.

`emailRoutesFlow.cjs` drives real endpoints and then reads the outbox:

```js
it('sends a password reset link from POST /api/v1/auth/reset-password-request', async () => {
  const res = await chai.request(app)
    .post('/api/v1/auth/reset-password-request')
    .send({ email: nurse.email });

  expect(res).to.have.status(200);

  const entry = outbox.list({ includeBody: true })[0];
  expect(entry.template).to.equal('password-reset');
  expect(entry.to).to.deep.equal([nurse.email]);
  expect(entry.html).to.contain('reset-password?token=');
});
```

No stubbed mailer, no mocking, nothing sent — `NODE_ENV=test` forces dry run.
The `send-pin` test goes further and asserts the PIN in the rendered HTML
matches the one persisted in the `OTP` collection, which is the kind of bug
that silently breaks a login flow.

Copy that shape for every new flow that sends email. It is three lines.

### Failure injection

Providers are resolved through `src/providers/index.js`, so you can swap one
mid-test to exercise paths that are otherwise impossible to reach:

```js
providers.PROVIDERS.dryrun = async () => {
  const error = new Error('rate limited by provider');
  error.statusCode = 502;
  throw error;
};
```

The suite uses this to confirm a provider rejection is recorded as `failed`
in the outbox and surfaces as a 502 with an `outboxId` the caller can follow.

### Manual equivalent

```bash
EMAIL_DRY_RUN=true npm start

curl -X POST http://localhost:3000/api/v1/auth/reset-password-request \
  -H 'Content-Type: application/json' -d '{"email":"nurse@guardian.test"}'

curl "http://localhost:3000/api/v1/email/outbox?limit=1" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 3. Local mail catcher — a real inbox, nothing leaves the machine

```bash
docker compose -f docker-compose.mailpit.yaml up -d
```

Then in `.env`:

```
EMAIL_PROVIDER=smtp
EMAIL_DRY_RUN=false
SMTP_HOST=localhost
SMTP_PORT=1025
```

Every message the backend produces lands in a browsable inbox at
**http://localhost:8025** — HTML, plain text, headers, raw source, and a
built-in HTML check. Real staff and resident addresses are safe because
nothing can leave the container.

Confirm the connection before you start debugging templates:

```bash
curl -X POST http://localhost:3000/api/v1/email/verify-connection \
  -H "Authorization: Bearer $TOKEN"
```

This runs a real SMTP handshake without sending. The test console has the same
thing behind its **Check connection** button.

> TLS note: catchers present self-signed certificates, so certificate
> validation defaults to off for loopback hosts (`localhost`, `127.0.0.1`,
> `mailpit`, `mailhog`) and on for everything else. Disabling it for a remote
> host in production is treated as a configuration error, not a warning.

If you run `guardian-backend` inside the same compose project, set
`SMTP_HOST=mailpit` instead of `localhost`.

---

## 4. Visual rendering

Rendering correctly in Node proves nothing about Outlook.

```bash
node scripts/render-all-templates.js
```

Writes every template plus its plain-text alternative to
`tmp/email-preview/`, with a dark index page that previews them side by side.
Commit the output and you get a crude visual diff on every template change.

For real clients, the one that matters is **Outlook desktop on Windows** — it
renders with the Word engine and is where table-based layouts break. Send the
`render-check` template to a real mailbox and look at it there, plus Gmail web
and one mobile client. `render-check` exercises every component at once
(severity badges, detail table, code block, unicode, long wrapping text), so a
single send covers the whole layout.

```bash
curl -X POST http://localhost:3000/api/v1/email/test \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"to":"you@yourdomain.com"}'
```

---

## 5. Provider verification

Turn the allowlist on first, so a mistake cannot reach a resident:

```
EMAIL_ALLOWLIST=@yourdomain.com
```

Non-matching recipients are then rejected with a 403 and recorded as
`blocked` rather than delivered. Enforcement switches on automatically as soon
as the list is non-empty.

Then send one real message per provider through the test console, flipping the
provider dropdown between sends — the override is per-request, so you do not
need to restart anything.

Resend publishes seed addresses (`delivered@resend.dev`, `bounced@resend.dev`,
`complained@resend.dev`) for exercising delivery outcomes without a real
inbox. Worth confirming against their current documentation, as that detail
may have moved since.

---

## Exploratory testing

`http://localhost:3000/api/v1/email/test-console`

Paste an admin bearer token, press Connect. Pick any template — the form is
generated from its field metadata, so new templates appear automatically —
load the sample data, preview into a sandboxed iframe, then dry-run send.
Click any outbox row to load that exact message back into the preview,
including failures and blocked recipients.

This is the right tool for "does this look right", and the wrong tool for
regression testing. Anything you find here, write up as a test in layer 1 or 2.

---

## Suggested npm scripts

```json
"test:email":        "NODE_ENV=test mocha 'src/test/emailFlow.cjs' --exit",
"test:email:routes": "NODE_ENV=test mocha 'src/test/emailRoutesFlow.cjs' --exit",
"email:preview":     "node scripts/render-all-templates.js",
"email:catcher":     "docker compose -f docker-compose.mailpit.yaml up -d"
```

## What is verified where

| Concern | Layer |
| --- | --- |
| Template renders, escapes, builds correct URLs | 1 |
| Config validation, key redaction | 1 |
| Allowlist, dry run, outbox bookkeeping | 1 |
| Admin-only access, 401/403 | 2 |
| A real flow produced the right email to the right address | 2 |
| Provider rejection handled and recorded | 2 |
| Message survives an SMTP round trip, multipart intact | 1 (optional) and 3 |
| Renders acceptably in Outlook / Gmail / mobile | 4 |
| Provider credentials and domain verification are correct | 5 |
