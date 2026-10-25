/**
 * Guardian Email Service — baseTemplate.js
 *
 * Guardian-branded HTML email layout plus the value-escaping and safe-href helpers shared by every template.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Guardian branded email layout.
 *
 * Table-based, inline-styled markup for broad email client support
 * (Outlook, Gmail, Apple Mail). No external CSS, no web fonts.
 *
 * Enhancements over the first version:
 *   - Optional logo image in the header (EMAIL_LOGO_URL), with the product
 *     name as the alt-text fallback.
 *   - Outlook-proof ("bulletproof") call-to-action button using VML, so the
 *     padding and rounded corners survive the Word rendering engine.
 *   - Dark-mode support via `color-scheme` plus a `prefers-color-scheme`
 *     block that overrides the inline light styles with `!important`.
 *   - WCAG-AA colours for buttons and links.
 *   - A reusable callout panel (info / success / warning / critical).
 *   - A compliant footer with an optional postal address and unsubscribe link.
 */

const BRAND = {
  primary: '#1F3A5F',
  primaryDark: '#16293F',
  accent: '#2E8B8B',      // decorative only (badges)
  button: '#0F6A6A',      // white text on this passes WCAG AA (6.4:1)
  link: '#0C5F5F',        // on white passes WCAG AA for body text (7.5:1)
  text: '#1F2933',
  muted: '#6B7684',
  page: '#EEF2F6',
  card: '#FFFFFF',
  border: '#D9E1E8'
};

// Dark-mode palette, applied through a prefers-color-scheme block.
const DARK = {
  page: '#0E1621',
  card: '#16202B',
  text: '#E6EDF3',
  muted: '#9AA7B4',
  border: '#2A3644'
};

const SEVERITY_COLOURS = {
  low: '#2E8B57',
  medium: '#B7791F',
  high: '#C05621',
  critical: '#B32B2B'
};

const CALLOUT_COLOURS = {
  info: { bar: BRAND.primary, bg: '#EEF3F9', title: BRAND.primaryDark },
  success: { bar: '#2E8B57', bg: '#EAF6EF', title: '#1E6B41' },
  warning: { bar: '#B7791F', bg: '#FBF3E4', title: '#8A5A12' },
  critical: { bar: '#B32B2B', bg: '#FBECEC', title: '#8A1F1F' }
};

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Only allow http(s) and mailto URLs into href attributes.
 */
function safeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^(https?:|mailto:)/i.test(raw)) return '';
  return escapeHtml(raw);
}

function paragraph(html) {
  return `<p class="gm-text" style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${BRAND.text}">${html}</p>`;
}

function detailRow(label, value) {
  return `<tr>
    <td class="gm-muted" style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.muted};width:38%">${escapeHtml(label)}</td>
    <td class="gm-text" style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${BRAND.text};font-weight:bold">${escapeHtml(value)}</td>
  </tr>`;
}

function detailTable(rows) {
  const body = rows
    .filter(row => row && row[1] !== undefined && row[1] !== null && row[1] !== '')
    .map(row => detailRow(row[0], row[1]))
    .join('');

  if (!body) return '';

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="gm-detail"
    style="border:1px solid ${BRAND.border};border-radius:6px;border-collapse:separate;margin:0 0 18px 0">
    ${body}
  </table>`;
}

function codeBlock(code) {
  return `<div style="margin:22px 0;text-align:center">
    <span style="display:inline-block;padding:14px 26px;background:${BRAND.page};border:1px solid ${BRAND.border};
      border-radius:8px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;
      letter-spacing:8px;color:${BRAND.primary}">${escapeHtml(code)}</span>
  </div>`;
}

function severityBadge(severity) {
  const key = String(severity || 'medium').toLowerCase();
  const colour = SEVERITY_COLOURS[key] || SEVERITY_COLOURS.medium;

  return `<span style="display:inline-block;padding:5px 12px;background:${colour};color:#FFFFFF;
    border-radius:12px;font-size:12px;font-weight:bold;text-transform:uppercase;
    letter-spacing:1px">${escapeHtml(key)}</span>`;
}

/**
 * A coloured callout panel for approvals, warnings and alerts.
 * @param {'info'|'success'|'warning'|'critical'} type
 * @param {string} title  Plain text (escaped here)
 * @param {string} html   Pre-escaped body HTML
 */
function callout(type, title, html) {
  const c = CALLOUT_COLOURS[type] || CALLOUT_COLOURS.info;
  const heading = title
    ? `<p style="margin:0 0 6px 0;font-size:14px;font-weight:bold;color:${c.title}">${escapeHtml(title)}</p>`
    : '';

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px 0">
    <tr>
      <td style="border-left:4px solid ${c.bar};background:${c.bg};border-radius:0 6px 6px 0;padding:14px 16px">
        ${heading}
        <div style="font-size:14px;line-height:1.6;color:${BRAND.text}">${html}</div>
      </td>
    </tr>
  </table>`;
}

/**
 * Renders the full email document.
 *
 * @param {object} options
 * @param {string} options.appName        Product name shown in the header
 * @param {string} options.heading        Main heading
 * @param {string} options.body           Pre-escaped HTML body
 * @param {string} [options.preheader]    Inbox preview text
 * @param {string} [options.buttonText]
 * @param {string} [options.buttonUrl]
 * @param {string} [options.accentColour] Header bar colour override
 * @param {string} [options.footerNote]
 * @param {string} [options.supportEmail]
 * @param {string} [options.logoUrl]      Header logo image (falls back to EMAIL_LOGO_URL)
 * @param {string} [options.appUrl]       Logo link target (falls back to APP_URL)
 * @param {string} [options.orgAddress]   Postal address for the footer (falls back to EMAIL_ORG_ADDRESS)
 * @param {string} [options.unsubscribeUrl] Optional unsubscribe link (falls back to EMAIL_UNSUBSCRIBE_URL)
 */
function baseTemplate(options) {
  const {
    appName,
    heading,
    body,
    preheader,
    buttonText,
    buttonUrl,
    accentColour,
    footerNote,
    supportEmail
  } = options;

  const headerColour = accentColour || BRAND.primary;
  const href = safeUrl(buttonUrl);

  const logoUrl = safeUrl(options.logoUrl || process.env.EMAIL_LOGO_URL || '');
  const appUrl = safeUrl(options.appUrl || process.env.APP_URL || process.env.BASE_URL || '');
  const orgAddress = options.orgAddress || process.env.EMAIL_ORG_ADDRESS || '';
  const unsubscribeUrl = safeUrl(options.unsubscribeUrl || process.env.EMAIL_UNSUBSCRIBE_URL || '');

  // Header brand: a logo image when configured, otherwise the product name.
  const brandMark = logoUrl
    ? `<img src="${logoUrl}" alt="${escapeHtml(appName)}" height="30"
         style="height:30px;width:auto;border:0;display:block;max-height:30px">`
    : `<span style="font-size:20px;font-weight:bold;letter-spacing:0.5px;color:#FFFFFF">${escapeHtml(appName)}</span>`;
  const brandHtml = appUrl
    ? `<a href="${appUrl}" style="text-decoration:none;color:#FFFFFF">${brandMark}</a>`
    : brandMark;

  // Bulletproof CTA: a VML roundrect for Outlook (Word engine), and a padded
  // anchor for every other client.
  const button = href
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0">
        <tr><td>
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
            href="${href}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="14%" strokecolor="${BRAND.button}" fillcolor="${BRAND.button}">
            <w:anchorlock/>
            <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(buttonText || 'Open Guardian')}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${href}" style="display:inline-block;padding:13px 28px;background:${BRAND.button};color:#FFFFFF;
            text-decoration:none;font-size:15px;font-weight:bold;border-radius:6px">${escapeHtml(buttonText || 'Open Guardian')}</a>
          <!--<![endif]-->
        </td></tr>
      </table>
      <p class="gm-muted" style="margin:0 0 10px 0;font-size:12px;color:${BRAND.muted};word-break:break-all">
        If the button does not work, copy this link into your browser:<br>
        <a href="${href}" style="color:${BRAND.link}">${href}</a>
      </p>`
    : '';

  const hiddenPreheader = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>`
    : '';

  const support = supportEmail
    ? ` If you need help, contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:${BRAND.link}">${escapeHtml(supportEmail)}</a>.`
    : '';

  const addressLine = orgAddress
    ? `<p class="gm-muted" style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:${BRAND.muted}">${escapeHtml(orgAddress)}</p>`
    : '';

  const unsubscribeLine = unsubscribeUrl
    ? `<p class="gm-muted" style="margin:6px 0 0 0;font-size:12px;color:${BRAND.muted}">
         <a href="${unsubscribeUrl}" style="color:${BRAND.link}">Unsubscribe</a> from these notifications.
       </p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(heading)}</title>
  <!--[if mso]><style>table,td{border-collapse:collapse}</style><![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .gm-body   { background:${DARK.page} !important; }
      .gm-card   { background:${DARK.card} !important; border-color:${DARK.border} !important; }
      .gm-footer { background:${DARK.page} !important; border-color:${DARK.border} !important; }
      .gm-heading, .gm-card .gm-text { color:${DARK.text} !important; }
      .gm-muted  { color:${DARK.muted} !important; }
      .gm-detail td { border-color:${DARK.border} !important; }
      .gm-detail .gm-text { color:${DARK.text} !important; }
    }
  </style>
</head>
<body class="gm-body" style="margin:0;padding:0;background:${BRAND.page};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text}">
  ${hiddenPreheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="gm-body" style="background:${BRAND.page}">
    <tr>
      <td align="center" style="padding:26px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="gm-card"
          style="max-width:620px;background:${BRAND.card};border-radius:10px;overflow:hidden;
            border:1px solid ${BRAND.border}">
          <tr>
            <td style="padding:20px 28px;background:${headerColour}">
              ${brandHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <h1 class="gm-heading" style="margin:0 0 18px 0;font-size:22px;line-height:1.3;color:${BRAND.primaryDark}">
                ${escapeHtml(heading)}
              </h1>
              ${body}
              ${button}
            </td>
          </tr>
          <tr>
            <td class="gm-footer" style="padding:18px 28px;background:${BRAND.page};border-top:1px solid ${BRAND.border}">
              <p class="gm-muted" style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:${BRAND.muted}">
                ${escapeHtml(
                  footerNote ||
                    'This is an automated message from Guardian. Please do not reply with personal health information.'
                )}${support}
              </p>
              ${addressLine}
              <p class="gm-muted" style="margin:0;font-size:12px;color:${BRAND.muted}">
                &copy; ${new Date().getFullYear()} ${escapeHtml(appName)}
              </p>
              ${unsubscribeLine}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  BRAND,
  DARK,
  SEVERITY_COLOURS,
  CALLOUT_COLOURS,
  baseTemplate,
  escapeHtml,
  safeUrl,
  paragraph,
  detailTable,
  codeBlock,
  severityBadge,
  callout
};
