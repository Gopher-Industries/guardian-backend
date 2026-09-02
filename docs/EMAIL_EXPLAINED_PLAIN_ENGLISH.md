# Guardian email module — a plain-English guide

Author: Graeme Thomas · 2026-08-08

This explains every part of the Guardian email system in everyday language, with
no assumed coding knowledge. The whole thing works like **an office mailroom**,
so that's the picture we'll use throughout.

---

## The big picture

Imagine your app needs to send a letter — a password reset, a welcome note, an
appointment reminder. Instead of every part of the app knowing how to print,
stamp and post letters, they all just walk up to one **mailroom** and say
"please send this." The mailroom does the rest: chooses nice stationery, fills
in the details, checks it's safe to send, hands it to a courier, and writes the
send down in a logbook.

That mailroom is the email module. Here's each person and piece of equipment in
it, what they do, and how they work together.

---

## The settings sheet — `.env` and `emailConfig.js`

**What it is:** A single sheet of settings pinned to the mailroom wall.

The `.env` file is the raw sheet — it says things like "today we're using the
local courier," "our return address is no-reply@guardian-monitor.com," and
"here's our office postal address." `emailConfig.js` is the assistant who reads
that sheet, fills in sensible defaults for anything left blank, and hands
everyone a tidy, ready-to-use summary.

**Why it matters:** You change *behaviour* by changing the sheet, not by
rewriting the mailroom. Want to switch from the local test courier to a real
one? Change one line. The assistant also **double-checks the sheet** and warns
you if something's inconsistent (for example, "you picked a courier but didn't
give me an account number").

---

## The mailroom manager — `emailService.js`

**What it is:** The person in charge who handles every outgoing letter.

When a request to send arrives, the manager runs the same routine every time:

1. **Checks the address is real** — not "not-an-email," but something shaped
   like a proper email address.
2. **Checks the guest list (allowlist)** — in test environments you can say
   "only ever send to my own team." Anyone not on the list is politely turned
   away and the attempt is noted.
3. **Checks the "don't actually post" switch (dry run)** — if this is on, the
   letter is fully prepared and logged, but never actually leaves the building.
   This is the safety net so tests and demos can't email real people.
4. **Only if all of that passes**, hands the letter to the courier.

**Why it matters:** All the safety lives in one place, applied identically to
every letter, so nothing slips out by accident.

---

## The letterhead — `templates/baseTemplate.js`

**What it is:** The company stationery every letter is printed on.

It's the branded frame around the content: the coloured header with your logo
or name, the neat body area, the footer with your address and an unsubscribe
link. It also owns the small reusable bits — the **button** ("Reset password"),
the **coloured highlight boxes** for warnings or confirmations, the **detail
tables**, and the big **code box** used for one-time PINs.

It quietly does three important jobs:

- **Makes text safe.** If a person's name somehow contained sneaky code, the
  letterhead turns it into harmless plain text so it can't do anything. (Same
  for links — only proper web/email links are allowed.)
- **Looks right everywhere.** Email programs are notoriously fussy (Outlook
  especially). The stationery is built the old-fashioned, bulletproof way so it
  renders correctly in Outlook, Gmail and Apple Mail alike, and it adapts to
  dark mode.
- **Stays consistent.** Every email looks like it came from the same
  organisation, because they all share this one frame.

---

## The library of form letters — `templates/emailTemplates.js`

**What it is:** A filing cabinet of ready-made letters, one per situation.

There are 23 of them — welcome, verify email, password reset, one-time PIN,
account approved, appointment reminder, results ready, payment receipt, and so
on. Each entry knows two things: **what blanks need filling in** (e.g. a reset
letter needs a name and a reset link) and **how to write itself** once those
blanks are provided.

Because each letter declares its own blanks, the rest of the system can be
clever automatically: the test screen builds the right input form for each
letter, and the tests can fill every letter with sample data and confirm it
prints properly — all without anyone updating a master list by hand. Add a new
letter here and it instantly appears everywhere.

**A deliberate health-privacy rule:** the care-related letters never contain
medical detail. A "results ready" email says *"your results are ready, sign in
to view them"* — it never puts the results in the email. Email isn't private
enough for that.

---

## The clock — `utils/datetime.js`

**What it is:** The clock on the mailroom wall that writes dates properly.

When a letter mentions a date and time ("your appointment is at…"), this makes
sure it's written in your local style and timezone — Perth time, Australian
format — no matter where the server actually lives. If you hand it something
that isn't really a date (like "next Tuesday morning"), it just leaves it
as-is.

---

## The couriers — the `providers/` folder

**What it is:** The different delivery companies, plus a dispatcher who picks
one.

- **`index.js` (the dispatcher)** looks at your settings sheet and calls the
  right courier for the job.
- **`smtpProvider.js`** is the workhorse for local development and for
  corporate mail relays. This is what talks to **Mailpit** (the fake post
  office, below) and to services like Microsoft 365.
- **`resendProvider.js`, `brevoProvider.js`, `mailersendProvider.js`** are three
  commercial delivery companies you can switch to for real, large-scale sending.
- **`dryRunProvider.js`** is the "pretend courier." It takes the letter, notes
  it down, and quietly bins it — used whenever the "don't actually post" switch
  is on.

**Why it's built this way:** The mailroom manager doesn't care *which* courier
is used — they all accept a letter the same way. So you can change delivery
company by changing one setting, and none of the rest of the system needs to
know or change. The commercial couriers are also only "called in" if you
actually use them, so the app runs fine even if their paperwork isn't
installed.

---

## The sent book — `services/emailOutbox.js`

**What it is:** The logbook by the door where every outgoing item is recorded.

Every attempt — delivered, pretend-sent, blocked, or failed — gets a line in
the book: who it was for, which letter, what happened, and the full contents if
you want to look. It keeps the most recent 100 or so and then lets old ones
roll off. It's a quick memory aid, not a permanent archive (it resets if the
app restarts).

**Why it matters:** When someone asks "did the reset email actually go out?",
you can look it up instead of guessing.

---

## The front desk — `routes/emailRoutes.js` and `controllers/emailController.js`

**What they are:** The counter where requests come in, and the clerk who
handles them.

- **The routes file** is the set of labelled service windows: "send a letter
  here," "preview a letter there," "look at the sent book over there." It also
  posts two guards at the counter:
  - a **bouncer** that only lets in staff with a valid admin pass, and
  - a **queue limiter** that stops anyone hammering the counter too fast.
- **The controller** is the clerk standing behind each window who actually does
  the task — takes your request, asks the mailroom manager to do the work, and
  hands back the result.

**Why it matters:** This is the safe, controlled front door. The powerful
"send email" machinery is only reachable by authorised staff, through these
specific windows.

---

## The practice room — `views/email-test-console.ejs`

**What it is:** A hands-on control panel in the browser for trying emails out.

You open it in your web browser, paste an admin pass, and you get a friendly
screen where you can pick any letter, fill in the blanks (or load realistic
sample values), **preview** exactly how it'll look, and **send a test** — with
the safety switch on so nothing escapes. You can also browse the sent book and
click any entry to see the exact email that was produced.

**Why it matters:** You can see and test everything without writing any code or
touching real recipients.

---

## The fake post office — Mailpit (in `docker-compose.yaml`)

**What it is:** A pretend postal service that runs on your own machine and
catches every letter.

During development the app is set to hand letters to Mailpit instead of the
real world. Mailpit grabs them all and shows them in a web inbox (at
`localhost:8025`) so you can read exactly what you'd have sent — the styled
version, the plain-text version, the headers, everything. **Nothing ever leaves
your computer**, so there's zero risk of accidentally emailing a real resident
or staff member while testing.

**Why it matters:** It's the difference between "I *think* the email looks
right" and actually seeing it, safely.

---

## The old phone line — `utils/mailer.js`

**What it is:** A kept-alive connection for the app's original code.

Before this module, the app called three specific functions to send its
reset and PIN emails. Rather than hunt down and rewire every one of those old
call sites, `mailer.js` keeps those exact three "phone extensions" working —
but now, when you dial them, they quietly route through the shiny new mailroom
instead of the old hard-wired sender.

**Why it matters:** The upgrade happened *underneath* the existing app with no
disruption. One real improvement: the old sender used to **silently swallow
failures** (it would say "reset link sent!" even when nothing was sent). The new
path reports failures honestly, so genuine problems become visible instead of
hidden.

---

## The quality inspectors — `test/emailFlow.cjs` and `test/emailRoutesFlow.cjs`

**What they are:** Automated checkers that prove the mailroom works.

There are 48 checks that run in seconds: they confirm every letter prints,
that dangerous input is neutralised, that the safety switches and guest list
work, that the sent book behaves, that the front-desk guards turn away
non-admins — and one that actually **posts a letter with an attachment to a
tiny throwaway post office** and confirms it arrived intact.

**Why it matters:** Anyone can change something and instantly know whether they
broke anything, without manually clicking around.

---

## Putting it together: what happens when a password reset is sent

1. A user clicks "forgot password." The app calls the **old phone line**
   (`mailer.js`), which forwards to the **mailroom manager**.
2. The manager reads the **settings sheet**, pulls the **password-reset form
   letter** from the library, and prints it on the **letterhead** — with the
   reset button and a working link.
3. It runs the safety routine: valid address? on the guest list? is the "don't
   post" switch on?
4. If all clear, it hands the letter to the current **courier**. In development
   that's **SMTP → Mailpit**, so the email lands in the local inbox you can
   open and read.
5. Win or lose, it writes a line in the **sent book**, and tells the app whether
   it succeeded — honestly.

That's the whole mailroom. Each piece has one clear job, they hand work to each
other through simple, consistent hand-offs, and the safety checks and the fake
post office mean you can build and test confidently without ever risking a real
person's inbox.
