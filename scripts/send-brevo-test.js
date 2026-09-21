/**
 * Guardian Email Service — send-brevo-test.js
 *
 * Sends one real email through Brevo using a template's sample payload, so you
 * can confirm end-to-end delivery once BREVO_API_KEY is set. Overrides the
 * provider to brevo and disables dry-run for this one run only.
 *
 * Usage:
 *   BREVO_API_KEY=xkeysib-... EMAIL_FROM=you@verified-domain \
 *     node scripts/send-brevo-test.js recipient@example.com [template] [--dry]
 *
 * Examples:
 *   node scripts/send-brevo-test.js me@example.com welcome
 *   node scripts/send-brevo-test.js me@example.com patient-alert --dry
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

require('dotenv').config();

const args = process.argv.slice(2).filter(a => a !== undefined);
const dry = args.includes('--dry');
const positional = args.filter(a => !a.startsWith('--'));
const to = positional[0];
const template = positional[1] || 'welcome';

if (!to) {
  console.error('Usage: node scripts/send-brevo-test.js <recipient> [template] [--dry]');
  process.exit(1);
}

// Force Brevo for this run. Real send unless --dry is passed.
process.env.EMAIL_PROVIDER = 'brevo';
process.env.EMAIL_DRY_RUN = dry ? 'true' : 'false';

const { sendTemplatedEmail, getTemplateSample, listTemplates } =
  require('../src/services/emailService');
const { validateEmailConfig, getEmailConfig } = require('../src/config/emailConfig');

(async () => {
  const keys = listTemplates().map(t => t.key);
  if (!keys.includes(template)) {
    console.error(`Unknown template "${template}". Available:\n  ${keys.join(', ')}`);
    process.exit(1);
  }

  const config = getEmailConfig();
  const validation = validateEmailConfig(config);

  if (!process.env.BREVO_API_KEY && !dry) {
    console.error('BREVO_API_KEY is not set. Add it to your .env or pass --dry to render only.');
    process.exit(1);
  }
  if (validation.warnings.length) {
    console.log('Config notes:', validation.warnings.join(' '));
  }
  console.log(`Sending "${template}" to ${to} via Brevo (dryRun=${dry}) from ${config.senderName} <${config.fromEmail}>...`);

  try {
    const data = { ...getTemplateSample(template), to };
    const result = await sendTemplatedEmail(template, data);
    console.log('\nResult:', JSON.stringify(result, null, 2));
    console.log(
      result.status === 'sent'
        ? '\n✅ Brevo accepted the message. Check the recipient inbox (and Brevo > Transactional > Logs).'
        : `\nℹ️  Status: ${result.status} (nothing was delivered).`
    );
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Send failed:', error.message);
    if (/domain|sender|not.*verified|401|403/i.test(error.message)) {
      console.error('Hint: the EMAIL_FROM address/domain must be verified in Brevo (Senders & IPs).');
    }
    process.exit(1);
  }
})();
