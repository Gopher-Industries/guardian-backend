/**
 * Guardian Email Service — emailConfig.js
 *
 * Resolves and validates all email-related environment variables into a single effective configuration object (provider, sender identity, SMTP settings and safety switches), with API keys redacted for display.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Email configuration for the Guardian backend.
 *
 * Resolves provider settings from environment variables and validates them
 * without throwing at require() time, so the application still boots when
 * email is not configured yet. Call validateEmailConfig() to inspect state.
 */

const SUPPORTED_PROVIDERS = ['resend', 'brevo', 'mailersend', 'smtp', 'dryrun'];

const PROVIDER_KEY_ENV = {
  resend: 'RESEND_API_KEY',
  brevo: 'BREVO_API_KEY',
  mailersend: 'MAILERSEND_API_KEY',
  smtp: null,
  dryrun: null
};

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0', 'mailpit', 'mailhog', 'mailcatcher'];

function isLocalHost(host) {
  return LOCAL_HOSTS.includes(String(host || '').trim().toLowerCase());
}

function toList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Builds the effective email configuration.
 * @param {object} overrides Runtime overrides, e.g. { provider: 'brevo', dryRun: true }
 */
function getEmailConfig(overrides = {}) {
  const envProvider = String(process.env.EMAIL_PROVIDER || 'dryrun').toLowerCase();
  const provider = String(overrides.provider || envProvider).toLowerCase();

  const globalDryRun = toBool(process.env.EMAIL_DRY_RUN, process.env.NODE_ENV === 'test');
  const allowlist = toList(process.env.EMAIL_ALLOWLIST);

  return {
    provider,
    supportedProviders: [...SUPPORTED_PROVIDERS],

    fromEmail: process.env.EMAIL_FROM || 'no-reply@guardian-monitor.com',
    senderName: process.env.EMAIL_SENDER_NAME || 'Guardian Monitor',
    replyTo: overrides.replyTo || process.env.EMAIL_REPLY_TO || '',
    supportEmail: process.env.EMAIL_SUPPORT_ADDRESS || 'support@guardian-monitor.com',

    appName: process.env.APP_NAME || 'Guardian Monitor',
    appUrl: process.env.APP_URL || process.env.BASE_URL || 'http://localhost:3000',
    baseUrl: process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000',

    // Branding and compliance extras used by the email layout
    logoUrl: process.env.EMAIL_LOGO_URL || '',
    orgAddress: process.env.EMAIL_ORG_ADDRESS || '',
    unsubscribeUrl: process.env.EMAIL_UNSUBSCRIBE_URL || '',

    // Localisation for dates rendered inside templates
    timezone: process.env.EMAIL_TIMEZONE || 'Australia/Perth',
    locale: process.env.EMAIL_LOCALE || 'en-AU',

    resendApiKey: process.env.RESEND_API_KEY || '',
    brevoApiKey: process.env.BREVO_API_KEY || '',
    mailersendApiKey: process.env.MAILERSEND_API_KEY || '',

    // SMTP (local catchers such as Mailpit/MailHog, or a corporate relay)
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT || 1025),
    smtpSecure: toBool(process.env.SMTP_SECURE, false),
    smtpUser: process.env.SMTP_USER || '',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    smtpPool: toBool(process.env.SMTP_POOL, true),
    // Local catchers (Mailpit, MailHog) present self-signed certificates, so
    // strict verification is off for loopback hosts unless you force it on.
    smtpRejectUnauthorized: toBool(
      process.env.SMTP_REJECT_UNAUTHORIZED,
      !isLocalHost(process.env.SMTP_HOST)
    ),
    smtpIgnoreTls: toBool(process.env.SMTP_IGNORE_TLS, false),
    smtpTimeoutMs: Number(process.env.SMTP_TIMEOUT_MS || 10000),

    // Safety controls
    dryRun: overrides.dryRun === undefined ? globalDryRun : toBool(overrides.dryRun, globalDryRun),
    allowlist: allowlist,
    // Enforced whenever a list is configured. Set EMAIL_ALLOWLIST_ENFORCE=true
    // with an empty list to block all outbound mail.
    allowlistEnforced: toBool(process.env.EMAIL_ALLOWLIST_ENFORCE, allowlist.length > 0),

    // Test console
    testConsoleEnabled: toBool(
      process.env.EMAIL_TEST_CONSOLE_ENABLED,
      process.env.NODE_ENV !== 'production'
    ),

    // Persisted "Sent" inbox
    inboxPersist: toBool(process.env.EMAIL_INBOX_PERSIST, true),
    inboxEnabled: toBool(process.env.EMAIL_INBOX_ENABLED, process.env.NODE_ENV !== 'production'),
    inboxRetentionDays: Number(process.env.EMAIL_INBOX_RETENTION_DAYS || 0),

    environment: process.env.NODE_ENV || 'development'
  };
}

/**
 * Validates a configuration object. Never throws.
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function validateEmailConfig(config = getEmailConfig()) {
  const errors = [];
  const warnings = [];

  if (!SUPPORTED_PROVIDERS.includes(config.provider)) {
    errors.push(
      `EMAIL_PROVIDER must be one of: ${SUPPORTED_PROVIDERS.join(', ')} (received "${config.provider}").`
    );
  }

  if (!config.fromEmail) {
    errors.push('EMAIL_FROM is required.');
  }

  const keyEnv = PROVIDER_KEY_ENV[config.provider];
  if (keyEnv) {
    const keyValue = {
      resend: config.resendApiKey,
      brevo: config.brevoApiKey,
      mailersend: config.mailersendApiKey
    }[config.provider];

    if (!keyValue && !config.dryRun) {
      errors.push(`${keyEnv} is required when EMAIL_PROVIDER is "${config.provider}".`);
    } else if (!keyValue) {
      warnings.push(`${keyEnv} is not set. Only dry-run sends will work.`);
    }
  }

  if (config.provider === 'smtp') {
    if (!config.smtpHost && !config.dryRun) {
      errors.push('SMTP_HOST is required when EMAIL_PROVIDER is "smtp".');
    }
    if (config.smtpUser && !config.smtpPassword) {
      warnings.push('SMTP_USER is set without SMTP_PASSWORD.');
    }
    if (!config.smtpSecure && config.environment === 'production') {
      warnings.push('SMTP_SECURE is off in production. Traffic to the relay may be unencrypted.');
    }
    if (!config.smtpRejectUnauthorized) {
      warnings.push(
        isLocalHost(config.smtpHost)
          ? `TLS certificate validation is off for the local host "${config.smtpHost}". Expected for a local mail catcher.`
          : 'SMTP_REJECT_UNAUTHORIZED is off for a non-local host. TLS certificates are not being validated.'
      );
    }
    if (!config.smtpRejectUnauthorized && config.environment === 'production' && !isLocalHost(config.smtpHost)) {
      errors.push('SMTP_REJECT_UNAUTHORIZED must not be disabled for a remote host in production.');
    }
  }

  if (config.provider === 'dryrun') {
    warnings.push('Provider is "dryrun". No email will leave the server.');
  }

  if (config.dryRun && config.provider !== 'dryrun') {
    warnings.push('EMAIL_DRY_RUN is enabled. Messages are rendered and stored, but not delivered.');
  }

  if (config.allowlistEnforced && config.allowlist.length === 0) {
    warnings.push(
      'EMAIL_ALLOWLIST_ENFORCE is on with an empty EMAIL_ALLOWLIST. Every recipient will be blocked.'
    );
  } else if (config.allowlistEnforced) {
    warnings.push(`Delivery is restricted to: ${config.allowlist.join(', ')}.`);
  } else if (!config.dryRun && config.environment !== 'production') {
    warnings.push(
      'No EMAIL_ALLOWLIST is set outside production. Real addresses can receive mail from this environment.'
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Returns a redacted view of the configuration, safe to send to a client.
 */
function describeEmailConfig(config = getEmailConfig()) {
  const mask = value => (value ? `set (${String(value).slice(0, 4)}…)` : 'not set');

  return {
    provider: config.provider,
    supportedProviders: config.supportedProviders,
    environment: config.environment,
    from: `${config.senderName} <${config.fromEmail}>`,
    replyTo: config.replyTo || null,
    appName: config.appName,
    appUrl: config.appUrl,
    logoUrl: config.logoUrl || null,
    orgAddress: config.orgAddress || null,
    unsubscribeUrl: config.unsubscribeUrl || null,
    timezone: config.timezone,
    locale: config.locale,
    dryRun: config.dryRun,
    allowlist: config.allowlist,
    allowlistEnforced: config.allowlistEnforced,
    testConsoleEnabled: config.testConsoleEnabled,
    inboxPersist: config.inboxPersist,
    inboxEnabled: config.inboxEnabled,
    inboxRetentionDays: config.inboxRetentionDays,
    keys: {
      resend: mask(config.resendApiKey),
      brevo: mask(config.brevoApiKey),
      mailersend: mask(config.mailersendApiKey)
    },
    smtp:
      config.provider === 'smtp'
        ? {
            host: config.smtpHost || null,
            port: config.smtpPort,
            secure: config.smtpSecure,
            authenticated: Boolean(config.smtpUser),
            rejectUnauthorized: config.smtpRejectUnauthorized,
            ignoreTls: config.smtpIgnoreTls,
            isLocalHost: isLocalHost(config.smtpHost)
          }
        : undefined,
    validation: validateEmailConfig(config)
  };
}

module.exports = {
  SUPPORTED_PROVIDERS,
  isLocalHost,
  getEmailConfig,
  validateEmailConfig,
  describeEmailConfig
};
