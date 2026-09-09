/**
 * Guardian Email Service — emailRoutes.js
 *
 * Express router mounted at /api/v1/email. Defines the admin-only email endpoints with rate limiting and Swagger annotations, and serves the browser test console.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const emailController = require('../controllers/emailController');
const verifyToken = require('../middleware/verifyToken');
const verifyRole = require('../middleware/verifyRole');
const { getEmailConfig } = require('../config/emailConfig');

const router = express.Router();

// Sending is more tightly limited than reading.
const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.EMAIL_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many email requests. Please try again later.' }
});

const adminOnly = [verifyToken, verifyRole(['admin'])];

/**
 * @swagger
 * tags:
 *   name: Email
 *   description: Transactional email delivery and testing
 */

/**
 * @swagger
 * /api/v1/email/config:
 *   get:
 *     summary: Show the effective email configuration (API keys redacted)
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current provider, safety switches and validation state
 *       403:
 *         description: Admin role required
 */
router.get('/config', adminOnly, emailController.getConfig);

/**
 * @swagger
 * /api/v1/email/verify-connection:
 *   post:
 *     summary: Check that the mail provider is reachable without sending anything
 *     description: >
 *       Runs a real SMTP handshake when EMAIL_PROVIDER is "smtp". HTTP API
 *       providers have no equivalent, and report as unsupported.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [resend, brevo, mailersend, smtp, dryrun]
 *     responses:
 *       200:
 *         description: Connection succeeded, or verification is unsupported
 *       502:
 *         description: Connection failed
 */
router.post('/verify-connection', adminOnly, emailController.verify);

/**
 * @swagger
 * /api/v1/email/templates:
 *   get:
 *     summary: List available email templates and their field metadata
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Template catalogue
 */
router.get('/templates', adminOnly, emailController.getTemplates);

/**
 * @swagger
 * /api/v1/email/templates/{type}/sample:
 *   get:
 *     summary: Get the sample payload for a template
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sample data
 *       400:
 *         description: Unknown template
 */
router.get('/templates/:type/sample', adminOnly, emailController.getSample);

/**
 * @swagger
 * /api/v1/email/preview:
 *   post:
 *     summary: Render a template without sending it
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template]
 *             properties:
 *               template:
 *                 type: string
 *                 example: patient-alert
 *               data:
 *                 type: object
 *               format:
 *                 type: string
 *                 enum: [json, html]
 *     responses:
 *       200:
 *         description: Rendered subject, html and text
 *       400:
 *         description: Unknown template or missing required fields
 */
router.post('/preview', adminOnly, emailController.preview);

/**
 * @swagger
 * /api/v1/email/send-option:
 *   post:
 *     summary: Send an email by option (destination + email option) — Brevo-focused simple send
 *     description: >
 *       The simplest way to send: provide a destination address ("to") and an
 *       email option ("option", a template key). Any fields the template needs
 *       that you do not provide are filled from that template's sample data, so
 *       a minimal { to, option } request always sends a valid email. With
 *       EMAIL_PROVIDER=brevo and a BREVO_API_KEY set, it delivers via Brevo.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, option]
 *             properties:
 *               to:
 *                 type: string
 *                 description: Destination email address
 *                 example: someone@example.com
 *               option:
 *                 type: string
 *                 description: Email option (template key)
 *                 example: welcome
 *               data:
 *                 type: object
 *                 description: Optional overrides for the template's fields
 *               provider:
 *                 type: string
 *                 enum: [brevo, resend, mailersend, smtp, dryrun]
 *                 description: Overrides EMAIL_PROVIDER for this request
 *               dryRun:
 *                 type: boolean
 *                 description: Render and record without delivering
 *     responses:
 *       202:
 *         description: Accepted for delivery
 *       400:
 *         description: Missing destination/option or unknown option
 *       403:
 *         description: Admin role required, or recipient blocked by the allowlist
 *       502:
 *         description: Provider (Brevo) rejected the message
 */
router.post('/send-option', sendLimiter, adminOnly, emailController.sendOption);

/**
 * @swagger
 * /api/v1/email/send:
 *   post:
 *     summary: Send a templated email
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template, data]
 *             properties:
 *               template:
 *                 type: string
 *                 example: otp
 *               data:
 *                 type: object
 *                 example:
 *                   to: nurse@example.com
 *                   name: Alex
 *                   otp: "482913"
 *               provider:
 *                 type: string
 *                 enum: [resend, brevo, mailersend, dryrun]
 *                 description: Overrides EMAIL_PROVIDER for this request
 *               dryRun:
 *                 type: boolean
 *                 description: Render and record the message without delivering it
 *     responses:
 *       202:
 *         description: Accepted for delivery
 *       400:
 *         description: Validation error
 *       403:
 *         description: Recipient blocked by the allowlist
 *       502:
 *         description: Provider rejected the message
 */
router.post('/send', sendLimiter, adminOnly, emailController.send);

/**
 * @swagger
 * /api/v1/email/send-raw:
 *   post:
 *     summary: Send an email with an explicit subject and body
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, subject]
 *             properties:
 *               to:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *               from:
 *                 type: string
 *                 description: Optional source (sender) email override
 *                 example: no-reply@your-domain.org
 *               fromName:
 *                 type: string
 *                 description: Optional sender display name override
 *                 example: Guardian Clinic
 *               subject:
 *                 type: string
 *               html:
 *                 type: string
 *               text:
 *                 type: string
 *               cc:
 *                 type: array
 *                 items:
 *                   type: string
 *               bcc:
 *                 type: array
 *                 items:
 *                   type: string
 *               replyTo:
 *                 type: string
 *               provider:
 *                 type: string
 *               dryRun:
 *                 type: boolean
 *     responses:
 *       202:
 *         description: Accepted for delivery
 */
router.post('/send-raw', sendLimiter, adminOnly, emailController.sendRaw);

/**
 * @swagger
 * /api/v1/email/send-bulk:
 *   post:
 *     summary: Send one templated email per recipient
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template, recipients]
 *             properties:
 *               template:
 *                 type: string
 *               recipients:
 *                 type: array
 *                 description: Addresses, or objects merged over the shared data
 *                 items:
 *                   oneOf:
 *                     - type: string
 *                     - type: object
 *               data:
 *                 type: object
 *               provider:
 *                 type: string
 *               dryRun:
 *                 type: boolean
 *     responses:
 *       202:
 *         description: Per-recipient results
 */
router.post('/send-bulk', sendLimiter, adminOnly, emailController.sendBulk);

/**
 * @swagger
 * /api/v1/email/test:
 *   post:
 *     summary: Send the built-in rendering smoke test
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to]
 *             properties:
 *               to:
 *                 type: string
 *               provider:
 *                 type: string
 *               dryRun:
 *                 type: boolean
 *     responses:
 *       202:
 *         description: Test email accepted
 */
router.post('/test', sendLimiter, adminOnly, emailController.sendSmokeTest);

/**
 * @swagger
 * /api/v1/email/outbox:
 *   get:
 *     summary: Inspect recent send attempts (sent, dry-run, blocked and failed)
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: template
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeBody
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Outbox entries, newest first
 *   delete:
 *     summary: Clear the in-memory outbox
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Outbox cleared
 */
router.get('/outbox', adminOnly, emailController.getOutbox);
router.delete('/outbox', adminOnly, emailController.clearOutbox);

/**
 * @swagger
 * /api/v1/email/outbox/{id}:
 *   get:
 *     summary: Get a single outbox entry including the rendered body
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Outbox entry
 *       404:
 *         description: Not found
 */
router.get('/outbox/:id', adminOnly, emailController.getOutboxEntry);
router.get('/outbox/:id/html', adminOnly, emailController.getOutboxEntryHtml);

/**
 * @swagger
 * /api/v1/email/inbox:
 *   get:
 *     summary: Browse the persisted "Sent" inbox (survives restarts)
 *     description: >
 *       Lists every email the tool has produced, newest first, from MongoDB.
 *       Falls back to the in-memory outbox when no database is connected
 *       (see the "source" field in the response).
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [sent, dry-run, blocked, failed] }
 *       - in: query
 *         name: template
 *         schema: { type: string }
 *       - in: query
 *         name: to
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         description: Free-text search over subject, recipient, template and sender
 *         schema: { type: string }
 *       - in: query
 *         name: includeBody
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: A page of sent messages
 *   delete:
 *     summary: Delete every message in the sent inbox
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inbox cleared
 */
router.get('/inbox', adminOnly, emailController.getInbox);
router.delete('/inbox', adminOnly, emailController.clearInbox);

/**
 * @swagger
 * /api/v1/email/inbox/stats:
 *   get:
 *     summary: Counts of sent messages grouped by status
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Totals by status
 */
router.get('/inbox/stats', adminOnly, emailController.getInboxStats);

/**
 * @swagger
 * /api/v1/email/inbox/{id}:
 *   get:
 *     summary: One sent message including the rendered body
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The message
 *       404:
 *         description: Not found
 */
router.get('/inbox/:id', adminOnly, emailController.getInboxEntry);
router.get('/inbox/:id/html', adminOnly, emailController.getInboxEntryHtml);

/**
 * @swagger
 * /api/v1/email/inbox-view:
 *   get:
 *     summary: Browsable read-only web page for the sent inbox
 *     description: >
 *       Static page (disabled in production unless EMAIL_INBOX_ENABLED=true).
 *       Paste an admin bearer token in the page to browse sent mail.
 *     tags: [Email]
 *     responses:
 *       200:
 *         description: HTML page
 *       404:
 *         description: Disabled
 */
router.get('/inbox-view', emailController.inboxView);

/**
 * @swagger
 * /api/v1/email/test-console:
 *   get:
 *     summary: Browser test console for previewing and sending Guardian emails
 *     description: >
 *       Static page. Disabled in production unless EMAIL_TEST_CONSOLE_ENABLED=true.
 *       All actions it performs require an admin bearer token entered in the page.
 *     tags: [Email]
 *     responses:
 *       200:
 *         description: HTML page
 *       404:
 *         description: Console disabled
 */
router.get('/test-console', (req, res) => {
  const config = getEmailConfig();

  if (!config.testConsoleEnabled) {
    return res.status(404).json({
      message: 'The email test console is disabled. Set EMAIL_TEST_CONSOLE_ENABLED=true to enable it.'
    });
  }

  // The page itself is unauthenticated, so it carries no configuration.
  // It fetches templates, config and the outbox using the admin token the
  // operator pastes into the page.
  return res.render('email-test-console', { apiBase: '/api/v1/email' }, (error, html) => {
    if (error) {
      // View engine is not configured (for example in the isolated test app).
      return res.status(500).json({
        message: 'Unable to render the email test console.',
        error: error.message
      });
    }
    return res.send(html);
  });
});

module.exports = router;
