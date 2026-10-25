# Email parameters, the reset-link flow, and edit-before-send

Author: Graeme Thomas · 2026-08-15

Answers three practical questions: what the password-reset link does to the
database, what parameters each email accepts, and how to choose an email and
edit it before it is sent.

---

## 1. What the password-reset link does to the database

Clicking the link in the email does **not** change the database. The reset is
three separate steps and only the last one writes:

| Step | Endpoint | Database effect |
| --- | --- | --- |
| 1. Request a reset | `POST /api/v1/auth/reset-password-request` | **None written.** Reads the user, signs a stateless JWT token (15-min expiry), emails the link. The token is not stored. |
| 2. **Click the email link** | `GET /api/v1/auth/reset-password?token=…` | **None.** Verifies the token and renders the reset form only. |
| 3. Submit the new password | `POST /api/v1/auth/reset-password` (`token`, `newPassword`, `confirmPassword`) | **Writes.** Sets `password_hash` (re-hashed on save), `lastPasswordChange`, resets `failedLoginAttempts`. |

So the link is safe to open; the account is only changed when the form is
submitted with a matching new password and a still-valid token.

> The PIN/OTP flow is different: `POST /api/v1/auth/send-pin` **creates** an
> `OTP` record in the database and `POST /api/v1/auth/verify-pin` consumes it.

---

## 2. Parameters each email accepts

Every send takes a destination `to` plus content fields in `data`. Each template
("option") declares its own fields. Discover them live with
`GET /api/v1/email/templates` and `GET /api/v1/email/templates/{option}/sample`.

| Option (template) | Category | Required (besides `to`) | Optional fields |
| --- | --- | --- | --- |
| `welcome` | Account | — | name, role, organizationName, loginUrl |
| `verify-email` | Account | verificationUrl | name, expiresInMinutes |
| `account-approved` | Account | approvalStatus | name, organizationName, reviewerName, reason |
| `staff-invite` | Account | inviterName, organizationName, inviteUrl | name, role, expiresInDays |
| `password-reset` | Auth | — | name, resetUrl, token, expiresInMinutes |
| `otp` | Auth | otp | name, expiresInMinutes |
| `password-expiry-reminder` | Auth | daysRemaining | name, expiryDate, changePasswordUrl |
| `patient-alert` | Monitoring | patientName, alertType | name, severity, detectedAt, location, alertUrl |
| `task-assigned` | Care | taskTitle | name, patientName, dueDate, priority, assignedBy, notes, taskUrl |
| `care-plan-updated` | Care | patientName | name, updatedBy, updatedAt, changeSummary, carePlanUrl |
| `daily-report` | Care | reportDate | name, patientName, alertCount, taskCount, reportUrl |
| `appointment-reminder` | Health | when | name, appointmentType, clinician, location, appointmentUrl |
| `appointment-confirmed` | Health | when | name, appointmentType, clinician, location, appointmentUrl |
| `appointment-cancelled` | Health | when | name, appointmentType, reason, rebookUrl |
| `results-ready` | Health | portalUrl | name, resultType |
| `secure-message` | Care | messageUrl | name, fromName |
| `account-locked` | Security | — | name, reason, unlockUrl |
| `suspicious-login` | Security | when | name, location, device, secureUrl |
| `two-factor-enabled` | Security | — | name, when |
| `shift-reminder` | Care | shiftStart | name, shiftEnd, location, rosterUrl |
| `receipt` | Billing | invoiceNumber, amount | name, paidOn, description, invoiceUrl |
| `custom-message` | Testing | subject, message | name, heading, buttonText, buttonUrl |
| `render-check` | Testing | — | name |

### Example payloads

```jsonc
// Simplest — destination + option (missing fields auto-filled from the sample)
{ "to": "someone@example.com", "option": "welcome" }

// With content parameters
{ "to": "nurse@example.com", "option": "otp",
  "data": { "name": "Alex", "otp": "482913", "expiresInMinutes": 5 } }

// A monitoring alert
{ "to": "carer@example.com", "option": "patient-alert",
  "data": { "name": "Alex", "patientName": "Margaret Doyle",
            "alertType": "Fall detected", "severity": "critical",
            "location": "Room 12, East Wing" } }
```

`custom-message` is the free-text option — pass your own `subject` and `message`
and they render inside the Guardian layout.

---

## 3. Choose which email, and edit it before it goes out

**Which email:** the `option` (or `template`) parameter selects it; `to` is the
destination.

**Edit before sending — three ways:**

**a) Preview, then send.** `POST /preview` renders without sending:

```bash
curl -X POST http://localhost:3000/api/v1/email/preview \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"template":"welcome","data":{"to":"sam@example.com","name":"Sam"}}'
# -> { subject, html, text }   (nothing sent)
```

Adjust the `data`, preview again, then send with `POST /send-option` or `/send`.

**b) Dry run.** Run the whole pipeline without delivering, inspect it, then send
for real:

```bash
curl -X POST http://localhost:3000/api/v1/email/send-option \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to":"sam@example.com","option":"welcome","dryRun":true}'
# review it at GET /api/v1/email/inbox, then resend without dryRun
```

**c) Edit the exact content, then send it verbatim.** Take the `html`/`subject`
from `/preview`, edit the wording, and send it as-is via `POST /send-raw`:

```bash
# 1) get the rendered html from /preview (see above), edit it, then:
curl -X POST http://localhost:3000/api/v1/email/send-raw \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to":"sam@example.com","subject":"Welcome, Sam!","html":"<your edited HTML>"}'
```

**Interactive:** the browser console at `/api/v1/email/test-console` does exactly
this — pick the option, edit the fields, **Preview**, then **Send**.

> Want a stateful "save draft → edit → approve → send" workflow (drafts stored
> and released by a second call)? That isn't built yet, but it's a small
> addition on top of the preview/outbox machinery — ask and I'll add it.

---

## 4. Source (sender), destination, name, patient ID — and edit-before-send

**Destination & name** are standard fields: `to` (destination) and `data.name`.

**Source (sender) override.** Any send now accepts an optional `from` (sender
email) and `fromName` (display name). If omitted, the configured `EMAIL_FROM` /
sender name is used. It's honoured by every provider (Brevo, SMTP, Resend,
MailerSend) and validated (a malformed `from` returns `400`).

- `send-raw`: pass `from` / `fromName` at the top level of the body.
- `send` / `send-option`: pass them inside `data`.

```jsonc
// send-option with a custom source and a patient ID
{
  "to": "carer@example.com",
  "option": "patient-alert",
  "data": {
    "from": "alerts@northside-care.org",   // source (sender) email
    "fromName": "Northside Care",           // sender display name
    "name": "Alex",
    "patientName": "Margaret Doyle",
    "patientId": "PT-000123",               // patient ID reference (no clinical detail)
    "alertType": "Fall detected",
    "severity": "critical",
    "location": "Room 12, East Wing"
  }
}
```

**Patient ID.** The care/monitoring templates — `patient-alert`,
`task-assigned`, `care-plan-updated`, `daily-report` — now accept an optional
`patientId`, shown as a "Patient ID" reference row. It is an identifier only, in
keeping with the module's rule of never putting clinical detail in email.

**See the view, then edit before sending.** Two supported flows:

1. **Field-level:** `POST /preview` (or the test console) renders the email from
   your `data` so you can see it; adjust any field — including `from`, `name`,
   `patientId` — and preview again until correct, then `POST /send-option`.
2. **Full content edit:** take the `html`/`subject` returned by `/preview`, edit
   the wording, and send it verbatim via `POST /send-raw` (with your own `from`
   if wanted). This lets a user change the exact content before it goes out.
