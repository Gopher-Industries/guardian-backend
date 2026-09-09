# Email module — improvements

Author: Graeme Thomas · 2026-08-08

This builds on the integrated Guardian email module with visual polish, more
templates and better deliverability. Everything is covered by the unit suite
(`npm run test:email` — 48 passing, no database needed).

## 1. Visual polish (applies to every template, including password reset)

- **Header logo.** Set `EMAIL_LOGO_URL` to an https image; it renders in the
  header with the product name as alt-text. With no logo set, the product name
  shows as before.
- **Outlook-proof buttons.** The call-to-action now emits a VML `roundrect` for
  Outlook's Word engine alongside the normal padded anchor, so padding and
  rounded corners survive in desktop Outlook.
- **Dark mode.** `color-scheme` metadata plus a `prefers-color-scheme` block
  (with `!important` overrides on tagged elements) gives an intentional dark
  appearance in Apple Mail / iOS instead of an awkward auto-invert.
- **Accessible colour.** Buttons use `#0F6A6A` and links `#0C5F5F`, both of which
  pass WCAG AA contrast on white (the previous teal was borderline).
- **Callout component.** A reusable `callout(type, title, html)` panel
  (`info` / `success` / `warning` / `critical`) used across approvals, alerts,
  security and billing emails.
- **Compliant footer.** Optional postal address (`EMAIL_ORG_ADDRESS`) and
  unsubscribe link (`EMAIL_UNSUBSCRIBE_URL`).

## 2. New templates (13 → 23)

| Key | Category | Notes |
| --- | --- | --- |
| `appointment-reminder` | Health | Upcoming appointment, no clinical detail |
| `appointment-confirmed` | Health | Booking confirmation |
| `appointment-cancelled` | Health | Cancellation / rebooking |
| `results-ready` | Health | "Results ready" — link only, nothing clinical in email |
| `secure-message` | Care | New care-team message waiting in the portal |
| `account-locked` | Security | Account locked + how to restore access |
| `suspicious-login` | Security | New/unexpected sign-in alert |
| `two-factor-enabled` | Security | 2FA turned on confirmation |
| `shift-reminder` | Care | Staff shift reminder |
| `receipt` | Billing | Payment receipt + invoice link |

All new templates appear automatically in the API, the test console and the
render tests. The health templates keep the module's "no clinical content in
email" property — they link to the secure portal instead.

## 3. Consistent dates

`src/utils/datetime.js` formats dates in a configurable locale/timezone
(`EMAIL_LOCALE`, `EMAIL_TIMEZONE`; defaults `en-AU` / `Australia/Perth`).
Templates accept a real date (ISO string, `Date`, or timestamp) and render it
consistently; non-date text is passed through unchanged.

## 4. Deliverability: headers and attachments

- **List-Unsubscribe.** When `EMAIL_UNSUBSCRIBE_URL` (or a support address) is
  configured, a `List-Unsubscribe` header (plus `List-Unsubscribe-Post` for
  one-click) is added to every send, improving inbox placement. An
  `X-Guardian-Template` header is always added.
- **Custom headers.** Any send may pass a `headers` object.
- **Attachments.** `POST /api/v1/email/send-raw` (and application code via
  `sendRawEmail` / `sendTemplatedEmail`) accept an `attachments` array
  (`{ filename, content | path | href, contentType }`). Wired end-to-end for
  SMTP and mapped for the Resend, Brevo and MailerSend providers. Attachment
  filenames are recorded in the outbox.

Example — send a receipt with a PDF over SMTP/Mailpit:

```js
await sendTemplatedEmail('receipt', {
  to: 'payer@example.com',
  name: 'Alex',
  invoiceNumber: 'INV-2026-0042',
  amount: 'A$120.00',
  paidOn: '2026-08-08',
  attachments: [{ filename: 'invoice.pdf', content: pdfBuffer, contentType: 'application/pdf' }]
});
```

## New environment variables

```
EMAIL_LOGO_URL=            # optional header logo (https)
EMAIL_ORG_ADDRESS=         # footer postal address
EMAIL_UNSUBSCRIBE_URL=     # unsubscribe link + List-Unsubscribe header
EMAIL_TIMEZONE=Australia/Perth
EMAIL_LOCALE=en-AU
```

## Deliverability checklist (DNS — do once per sending domain)

For hosted providers or a relay to actually reach inboxes, publish:

- **SPF** — a TXT record authorising your provider's servers.
- **DKIM** — the CNAME/TXT keys your provider gives you, so mail is signed.
- **DMARC** — a `_dmarc` TXT record (start with `p=none` to monitor, then move
  to `quarantine`/`reject`) aligned with the `EMAIL_FROM` domain.

Mailpit needs none of this — it accepts everything locally.

## Not included (suggested follow-up)

Persisting the outbox to MongoDB and a retry-with-backoff worker were left out
as a separate, larger change so this set stays fully testable without a
database.
