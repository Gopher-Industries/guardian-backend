# Sent inbox (persisted)

Author: Graeme Thomas · 2026-08-08

The email tool now keeps a **persisted Sent inbox**: every message it produces
(sent, dry-run, blocked or failed) is written to MongoDB, so you can browse the
full history in any environment and it survives restarts — unlike the original
in-memory outbox, which resets when the app stops.

## How it works

- On every send, the message is recorded in the in-memory outbox **and** written
  through to MongoDB (collection `sent_emails`). The database write is awaited,
  so a read immediately after a send always sees it.
- Writes are best-effort: if the database is momentarily unavailable, sending
  still succeeds — persistence just no-ops for that message and logs a warning.
- If no database is connected at all (e.g. a DB-less dev run), the inbox
  endpoints automatically **fall back to the in-memory outbox**. Each response
  says which it used via a `source` field (`"db"` or `"memory"`).

## Browse it in the browser

Open **http://localhost:3000/api/v1/email/inbox-view**, paste an admin bearer
token, and press Connect. You get a read-only mail client: a searchable,
filterable list on the left (by status, template, or free text over
subject/recipient), and a preview on the right that renders the exact HTML that
was produced, with all the metadata (provider, message id, attachments, errors).

It's disabled in production unless `EMAIL_INBOX_ENABLED=true`.

## Or use the API

All require an admin bearer token, and all appear in Swagger (`/swaggerDocs`).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/email/inbox` | List sent messages (filters: `status`, `template`, `to`, `q`; paging: `page`, `limit`; `includeBody`) |
| GET | `/api/v1/email/inbox/stats` | Totals grouped by status |
| GET | `/api/v1/email/inbox/{id}` | One message including the rendered body |
| GET | `/api/v1/email/inbox/{id}/html` | The rendered HTML alone |
| DELETE | `/api/v1/email/inbox` | Clear the stored inbox |

Example:

```bash
curl "http://localhost:3000/api/v1/email/inbox?status=sent&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

## Settings

```
EMAIL_INBOX_PERSIST=true          # write sends to MongoDB (default true)
EMAIL_INBOX_ENABLED=true          # serve the browsable page (default: on outside production)
EMAIL_INBOX_RETENTION_DAYS=0      # auto-expire old messages after N days (0 = keep forever)
```

## Inbox vs Mailpit — what's the difference?

- **Mailpit** is a fake *receiving* server for development: it shows mail the app
  *tried to send* over SMTP, and only in dev. Great for eyeballing rendering.
- **The Sent inbox** is part of the app itself: it records *every* send through
  *any* provider (Brevo, SMTP, dry-run…), persists it to your database, and is
  available in production. It's a durable audit log of outbound mail, not a dev
  catcher.

This is a **sent** inbox (outbound history). Receiving real incoming email
(replies to an address) is a separate feature and is not included here.

## Tests

- No-database behaviour (fallback + safe no-op persistence) is covered in
  `src/test/emailFlow.cjs` and runs with no database.
- Full persistence (write-through, survives an outbox clear, filtering, stats,
  clear) is covered in `src/test/emailRoutesFlow.cjs`, which runs against
  MongoDB like the other `*Flow.cjs` suites: `docker compose up -d mongo` then
  `npm run test:email:routes`.
