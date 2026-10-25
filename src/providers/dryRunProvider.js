/**
 * Guardian Email Service — dryRunProvider.js
 *
 * Dry-run transport. Renders and records a message but never contacts a provider, so the full send path can be exercised without delivering anything.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Dry-run provider.
 *
 * Renders and records the message without contacting any external service.
 * Used when EMAIL_PROVIDER=dryrun, when EMAIL_DRY_RUN=true, during tests,
 * and whenever the allowlist blocks a recipient.
 */

const crypto = require('crypto');

async function sendWithDryRun(config, message) {
  const messageId = `dryrun-${crypto.randomBytes(8).toString('hex')}`;

  if (config.environment !== 'test') {
    console.info(
      JSON.stringify({
        event: 'email_dry_run',
        messageId,
        to: message.to,
        subject: message.subject,
        attachments: (message.attachments || []).length,
        intendedProvider: message.intendedProvider || config.provider
      })
    );
  }

  return {
    provider: 'dryrun',
    messageId,
    raw: {
      note: 'Dry run: message was rendered and recorded but not delivered.',
      intendedProvider: message.intendedProvider || config.provider
    }
  };
}

module.exports = { sendWithDryRun };
