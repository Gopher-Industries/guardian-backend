# Testing locally without the full server

You can explore and exercise the email API on your PC **without** running the
whole application (no MongoDB, no auth, no seeding). Three options, easiest first.

---

## Option 1 — Static Swagger page (just open a file)

Open **`guardian-email-swagger.html`** in your browser (double-click it). You get
the full Swagger documentation for every email endpoint — request shapes,
parameters, the template dropdown — with **no install and no server**.

- Browsing works immediately (it loads the Swagger UI library from the internet).
- To actually **execute** requests ("Try it out"), start the sandbox in Option 2
  first — this page is pre-pointed at `http://localhost:4000`.

## Option 2 — Email sandbox (real "Try it out", still no full app)

A tiny standalone server that mounts **only** the email API, with **no database
and no authentication**, dry-run by default (nothing is delivered).

```bash
npm install            # once, to get the dependencies
npm run email:sandbox  # starts http://localhost:4000
```

Then open **http://localhost:4000/swaggerDocs** and use **Try it out** on any
endpoint — no token needed. For example, `POST /api/v1/email/send-option` with:

```json
{ "to": "me@example.com", "option": "welcome" }
```

returns a `202` and a `dry-run` result. You can also open:

- **Test console:** http://localhost:4000/api/v1/email/test-console
- **Sent inbox:** http://localhost:4000/api/v1/email/inbox-view

  (on the console/inbox pages, paste **any text** as the token — auth is stubbed).

Nothing is sent by default. To send for real through Brevo, start it with a key:

```bash
# macOS/Linux
EMAIL_PROVIDER=brevo BREVO_API_KEY=xkeysib-xxxx EMAIL_FROM=you@verified-domain npm run email:sandbox
# Windows PowerShell
$env:EMAIL_PROVIDER="brevo"; $env:BREVO_API_KEY="xkeysib-xxxx"; $env:EMAIL_FROM="you@verified-domain"; npm run email:sandbox
```

Change the port with `SANDBOX_PORT` (e.g. `SANDBOX_PORT=5000 npm run email:sandbox`).

## Option 3 — Online Swagger, no local install at all

Go to <https://editor.swagger.io>, choose **File → Import file**, and load
**`guardian-openapi.json`** (in the project root, or `src/openapi.json`). You'll
see the whole API rendered. "Try it out" there needs a running server (the
sandbox in Option 2, or the full app).

---

## What each option needs

| Option | Needs npm install | Needs a server running | Can execute requests |
| --- | --- | --- | --- |
| 1. Static Swagger HTML | No | No (for viewing) | Only if the sandbox (Opt. 2) is running |
| 2. Email sandbox | Yes (once) | Yes (the tiny sandbox) | Yes — no token/DB needed |
| 3. Swagger Editor online | No | Only to execute | Only against a running server |

## Also: see the emails without any server

To just *look at* the rendered emails as HTML files:

```bash
npm run email:preview     # writes every template to tmp/email-preview/*.html
```

Open those files in a browser — no server, no database.
