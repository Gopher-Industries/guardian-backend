/**
 * Guardian Email Service — emailTemplates.js
 *
 * Registry of the Guardian email templates with per-template field metadata and a build() function. Drives the API, the test-console form and the render tests.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Guardian email template registry.
 *
 * Every template declares its own field metadata. The service uses that
 * metadata to validate input, and the test console uses it to build its
 * form automatically — adding a template here makes it immediately
 * testable in the UI with no front-end changes.
 */

const {
  BRAND,
  baseTemplate,
  escapeHtml,
  paragraph,
  detailTable,
  codeBlock,
  severityBadge,
  callout,
  SEVERITY_COLOURS
} = require('./baseTemplate');
const { formatDateTime } = require('../utils/datetime');

/** Formats a date value for a template using the config's locale/timezone. */
function whenText(value, config, opts = {}) {
  return formatDateTime(value, { timeZone: config.timezone, locale: config.locale, ...opts });
}

function field(name, label, options = {}) {
  return {
    name,
    label,
    type: options.type || 'text',
    required: options.required === true,
    sample: options.sample === undefined ? '' : options.sample,
    help: options.help || '',
    choices: options.choices || undefined
  };
}

const RECIPIENT_FIELDS = [
  field('to', 'Recipient email', { type: 'email', required: true, sample: 'test@example.com' }),
  field('name', 'Recipient name', { sample: 'Alex' })
];

const TEMPLATES = {
  /* ------------------------------------------------------------------ */
  /* Account lifecycle                                                   */
  /* ------------------------------------------------------------------ */
  welcome: {
    key: 'welcome',
    name: 'Welcome',
    category: 'Account',
    description: 'Sent after a Guardian account is created.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('role', 'Role', { sample: 'Nurse', choices: ['Nurse', 'Caretaker', 'Doctor', 'Admin'] }),
      field('organizationName', 'Organisation', { sample: 'Northside Care Group' }),
      field('loginUrl', 'Login URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const name = escapeHtml(data.name || 'there');

      return {
        subject: `Welcome to ${config.appName}`,
        preheader: 'Your Guardian account is ready.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Your ${config.appName} account has been created.\n` +
          `Sign in: ${data.loginUrl || `${config.appUrl}/login`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: `Welcome, ${name}`,
          preheader: 'Your Guardian account is ready.',
          body:
            paragraph('Your account has been created and is ready to use.') +
            detailTable([
              ['Role', data.role],
              ['Organisation', data.organizationName],
              ['Email', data.to]
            ]) +
            paragraph(
              'Sign in to view your assigned residents, tasks and alerts. Please change your password after your first sign-in.'
            ),
          buttonText: 'Sign in to Guardian',
          buttonUrl: data.loginUrl || `${config.appUrl}/login`
        })
      };
    }
  },

  'verify-email': {
    key: 'verify-email',
    name: 'Verify email address',
    category: 'Account',
    description: 'Email address confirmation link.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('verificationUrl', 'Verification URL', {
        type: 'url',
        required: true,
        sample: 'https://guardian.example.com/verify?token=sample-token'
      }),
      field('expiresInMinutes', 'Expires in (minutes)', { type: 'number', sample: 60 })
    ],
    build(data, config) {
      return {
        subject: `Verify your ${config.appName} email address`,
        preheader: 'Confirm your email address to activate your account.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Verify your email address: ${data.verificationUrl}\n` +
          `This link expires in ${data.expiresInMinutes || 60} minutes.\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Verify your email address',
          preheader: 'Confirm your email address to activate your account.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, please confirm this email address to activate your account.`) +
            paragraph(
              `This link expires in <strong>${escapeHtml(data.expiresInMinutes || 60)} minutes</strong>. If you did not create a Guardian account, you can ignore this email.`
            ),
          buttonText: 'Verify email address',
          buttonUrl: data.verificationUrl
        })
      };
    }
  },

  'account-approved': {
    key: 'account-approved',
    name: 'Account approval decision',
    category: 'Account',
    description: 'Notifies staff that an admin approved or rejected their registration.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('approvalStatus', 'Decision', {
        required: true,
        sample: 'approved',
        choices: ['approved', 'rejected', 'pending']
      }),
      field('organizationName', 'Organisation', { sample: 'Northside Care Group' }),
      field('reviewerName', 'Reviewed by', { sample: 'Dana Whitfield' }),
      field('reason', 'Reason / note', { type: 'textarea', sample: '' })
    ],
    build(data, config) {
      const status = String(data.approvalStatus || 'pending').toLowerCase();
      const approved = status === 'approved';
      const rejected = status === 'rejected';

      const heading = approved
        ? 'Your Guardian account has been approved'
        : rejected
          ? 'Your Guardian account request was not approved'
          : 'Your Guardian account is under review';

      return {
        subject: `${config.appName}: account ${status}`,
        preheader: heading,
        text: `Hello ${data.name || 'there'},\n\n${heading}.\n${data.reason ? `Note: ${data.reason}\n` : ''}`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          accentColour: rejected ? SEVERITY_COLOURS.high : BRAND.primary,
          heading,
          preheader: heading,
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')},`) +
            detailTable([
              ['Decision', status],
              ['Organisation', data.organizationName],
              ['Reviewed by', data.reviewerName]
            ]) +
            (data.reason ? paragraph(`<strong>Note:</strong> ${escapeHtml(data.reason)}`) : '') +
            paragraph(
              approved
                ? 'You can now sign in and begin working with your assigned residents.'
                : 'If you believe this is an error, please contact your organisation administrator.'
            ),
          buttonText: approved ? 'Sign in to Guardian' : undefined,
          buttonUrl: approved ? `${config.appUrl}/login` : undefined
        })
      };
    }
  },

  'staff-invite': {
    key: 'staff-invite',
    name: 'Staff invitation',
    category: 'Account',
    description: 'Invites a nurse, caretaker or doctor to join an organisation.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('inviterName', 'Invited by', { required: true, sample: 'Dana Whitfield' }),
      field('organizationName', 'Organisation', { required: true, sample: 'Northside Care Group' }),
      field('role', 'Role offered', { sample: 'Nurse', choices: ['Nurse', 'Caretaker', 'Doctor', 'Admin'] }),
      field('inviteUrl', 'Invitation URL', {
        type: 'url',
        required: true,
        sample: 'https://guardian.example.com/invite?token=sample-token'
      }),
      field('expiresInDays', 'Expires in (days)', { type: 'number', sample: 7 })
    ],
    build(data, config) {
      return {
        subject: `${data.inviterName} invited you to ${data.organizationName} on ${config.appName}`,
        preheader: `Join ${data.organizationName} on Guardian.`,
        text:
          `${data.inviterName} has invited you to join ${data.organizationName} on ${config.appName}` +
          `${data.role ? ` as a ${data.role}` : ''}.\n\nAccept: ${data.inviteUrl}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'You have been invited to Guardian',
          preheader: `Join ${data.organizationName} on Guardian.`,
          body:
            paragraph(
              `<strong>${escapeHtml(data.inviterName)}</strong> has invited you to join ` +
                `<strong>${escapeHtml(data.organizationName)}</strong> on ${escapeHtml(config.appName)}.`
            ) +
            detailTable([
              ['Organisation', data.organizationName],
              ['Role', data.role],
              ['Invitation expires', data.expiresInDays ? `${data.expiresInDays} days` : '']
            ]) +
            paragraph('Accept the invitation to set your password and complete your profile.'),
          buttonText: 'Accept invitation',
          buttonUrl: data.inviteUrl
        })
      };
    }
  },

  /* ------------------------------------------------------------------ */
  /* Authentication                                                      */
  /* ------------------------------------------------------------------ */
  'password-reset': {
    key: 'password-reset',
    name: 'Password reset',
    category: 'Authentication',
    description: 'Password reset link. Matches the existing /api/v1/auth flow.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('resetUrl', 'Reset URL', { type: 'url', sample: '', help: 'Leave blank to build from token.' }),
      field('token', 'Reset token', { sample: 'sample-reset-token' }),
      field('expiresInMinutes', 'Expires in (minutes)', { type: 'number', sample: 15 })
    ],
    build(data, config) {
      const resetUrl =
        data.resetUrl || `${config.baseUrl}/api/v1/auth/reset-password?token=${encodeURIComponent(data.token || '')}`;

      return {
        subject: `${config.appName} password reset`,
        preheader: 'Reset your Guardian password.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Reset your password: ${resetUrl}\n` +
          `This link expires in ${data.expiresInMinutes || 15} minutes.\n` +
          `If you did not request this, you can ignore this email.\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Reset your password',
          preheader: 'Reset your Guardian password.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')},`) +
            paragraph('We received a request to reset the password on your Guardian account.') +
            paragraph(
              `This link expires in <strong>${escapeHtml(data.expiresInMinutes || 15)} minutes</strong>. ` +
                'If you did not request a reset, no action is needed and your password will not change.'
            ),
          buttonText: 'Reset password',
          buttonUrl: resetUrl
        })
      };
    }
  },

  otp: {
    key: 'otp',
    name: 'One-time PIN',
    category: 'Authentication',
    description: 'Six-digit verification PIN. Matches the existing verify-pin flow.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('otp', 'PIN code', { required: true, sample: '482913' }),
      field('expiresInMinutes', 'Expires in (minutes)', { type: 'number', sample: 5 })
    ],
    build(data, config) {
      return {
        subject: `${config.appName} verification code`,
        preheader: `Your verification code is ${data.otp}.`,
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Your ${config.appName} verification code is ${data.otp}.\n` +
          `It expires in ${data.expiresInMinutes || 5} minutes.\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Your verification code',
          preheader: `Your verification code is ${data.otp}.`,
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, use this code to continue signing in:`) +
            codeBlock(data.otp) +
            paragraph(
              `This code expires in <strong>${escapeHtml(data.expiresInMinutes || 5)} minutes</strong>. ` +
                'Guardian staff will never ask you for this code.'
            )
        })
      };
    }
  },

  'password-expiry-reminder': {
    key: 'password-expiry-reminder',
    name: 'Password expiry reminder',
    category: 'Authentication',
    description: 'Warns a user before the password expiry middleware locks them out.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('daysRemaining', 'Days remaining', { type: 'number', required: true, sample: 5 }),
      field('expiryDate', 'Expiry date', { sample: '21 August 2026' }),
      field('changePasswordUrl', 'Change password URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const days = Number(data.daysRemaining || 0);

      return {
        subject: `${config.appName}: your password expires in ${days} day${days === 1 ? '' : 's'}`,
        preheader: 'Change your password to avoid losing access.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Your Guardian password expires in ${days} day${days === 1 ? '' : 's'}` +
          `${data.expiryDate ? ` (${data.expiryDate})` : ''}.\n` +
          `Change it here: ${data.changePasswordUrl || `${config.appUrl}/change-password`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          accentColour: days <= 3 ? SEVERITY_COLOURS.high : BRAND.primary,
          heading: 'Your password expires soon',
          preheader: 'Change your password to avoid losing access.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')},`) +
            detailTable([
              ['Days remaining', days],
              ['Expires on', data.expiryDate]
            ]) +
            paragraph('Change your password before it expires so you keep uninterrupted access to resident alerts.'),
          buttonText: 'Change password',
          buttonUrl: data.changePasswordUrl || `${config.appUrl}/change-password`
        })
      };
    }
  },

  /* ------------------------------------------------------------------ */
  /* Monitoring and care                                                 */
  /* ------------------------------------------------------------------ */
  'patient-alert': {
    key: 'patient-alert',
    name: 'Resident alert',
    category: 'Monitoring',
    description:
      'Alert raised by activity recognition. Deliberately excludes clinical detail — carers sign in for the full record.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('patientName', 'Resident name', { required: true, sample: 'Margaret Doyle' }),
      field('patientId', 'Patient ID', { sample: 'PT-000123' }),
      field('alertType', 'Alert type', {
        required: true,
        sample: 'Fall detected',
        choices: ['Fall detected', 'Prolonged inactivity', 'Unusual movement', 'Left room overnight', 'Sensor offline']
      }),
      field('severity', 'Severity', {
        sample: 'high',
        choices: ['low', 'medium', 'high', 'critical']
      }),
      field('detectedAt', 'Detected at', { sample: '07 August 2026, 02:14 AWST' }),
      field('location', 'Location', { sample: 'Room 12, East Wing' }),
      field('alertUrl', 'Alert URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const severity = String(data.severity || 'medium').toLowerCase();
      const colour = SEVERITY_COLOURS[severity] || SEVERITY_COLOURS.medium;

      return {
        subject: `[${severity.toUpperCase()}] ${data.alertType} — ${data.patientName}`,
        preheader: `${data.alertType} for ${data.patientName}. Sign in to review.`,
        text:
          `${severity.toUpperCase()} ALERT\n\n` +
          `Resident: ${data.patientName}\n` +
          `Alert: ${data.alertType}\n` +
          `Detected: ${data.detectedAt || 'just now'}\n` +
          `${data.location ? `Location: ${data.location}\n` : ''}` +
          `\nSign in to Guardian to review and acknowledge: ${data.alertUrl || `${config.appUrl}/alerts`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          accentColour: colour,
          heading: `${data.alertType}`,
          preheader: `${data.alertType} for ${data.patientName}. Sign in to review.`,
          body:
            `<p style="margin:0 0 16px 0">${severityBadge(severity)}</p>` +
            paragraph(
              `An alert has been raised for <strong>${escapeHtml(data.patientName)}</strong>. ` +
                'Please review and acknowledge it in Guardian.'
            ) +
            detailTable([
              ['Resident', data.patientName],
              ['Patient ID', data.patientId],
              ['Alert type', data.alertType],
              ['Severity', severity],
              ['Detected at', data.detectedAt],
              ['Location', data.location]
            ]) +
            paragraph(
              '<em>No clinical information is included in this email. Sign in to the secure portal for the full record.</em>'
            ),
          buttonText: 'Review alert',
          buttonUrl: data.alertUrl || `${config.appUrl}/alerts`,
          footerNote:
            'Guardian alerts are a monitoring aid, not an emergency service. In an emergency, call your local emergency number.'
        })
      };
    }
  },

  'task-assigned': {
    key: 'task-assigned',
    name: 'Task assigned',
    category: 'Care',
    description: 'Notifies a staff member that a task has been assigned to them.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('taskTitle', 'Task title', { required: true, sample: 'Morning mobility check' }),
      field('patientName', 'Resident', { sample: 'Margaret Doyle' }),
      field('dueDate', 'Due', { sample: '08 August 2026, 09:00' }),
      field('patientId', 'Patient ID', { sample: 'PT-000123' }),
      field('priority', 'Priority', { sample: 'high', choices: ['low', 'medium', 'high'] }),
      field('assignedBy', 'Assigned by', { sample: 'Dana Whitfield' }),
      field('notes', 'Notes', { type: 'textarea', sample: 'Check walking frame height before the session.' }),
      field('taskUrl', 'Task URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      return {
        subject: `New task: ${data.taskTitle}`,
        preheader: `${data.taskTitle}${data.dueDate ? ` — due ${data.dueDate}` : ''}`,
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `A task has been assigned to you.\n\n` +
          `Task: ${data.taskTitle}\n` +
          `${data.patientName ? `Resident: ${data.patientName}\n` : ''}` +
          `${data.dueDate ? `Due: ${data.dueDate}\n` : ''}` +
          `${data.notes ? `Notes: ${data.notes}\n` : ''}` +
          `\nOpen: ${data.taskUrl || `${config.appUrl}/tasks`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'A task has been assigned to you',
          preheader: `${data.taskTitle}${data.dueDate ? ` — due ${data.dueDate}` : ''}`,
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')},`) +
            detailTable([
              ['Task', data.taskTitle],
              ['Resident', data.patientName],
              ['Patient ID', data.patientId],
              ['Due', data.dueDate],
              ['Priority', data.priority],
              ['Assigned by', data.assignedBy]
            ]) +
            (data.notes ? paragraph(`<strong>Notes:</strong> ${escapeHtml(data.notes)}`) : ''),
          buttonText: 'Open task',
          buttonUrl: data.taskUrl || `${config.appUrl}/tasks`
        })
      };
    }
  },

  'care-plan-updated': {
    key: 'care-plan-updated',
    name: 'Care plan updated',
    category: 'Care',
    description: 'Neutral notification that a care plan changed. Contains no clinical detail.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('patientName', 'Resident', { required: true, sample: 'Margaret Doyle' }),
      field('patientId', 'Patient ID', { sample: 'PT-000123' }),
      field('updatedBy', 'Updated by', { sample: 'Dr Taylor' }),
      field('updatedAt', 'Updated at', { sample: '07 August 2026, 14:05 AWST' }),
      field('changeSummary', 'Change summary (non-clinical)', {
        type: 'textarea',
        sample: 'Review schedule adjusted.'
      }),
      field('carePlanUrl', 'Care plan URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      return {
        subject: `Care plan updated for ${data.patientName}`,
        preheader: 'Sign in to Guardian to review the updated care plan.',
        text:
          `The care plan for ${data.patientName} was updated` +
          `${data.updatedBy ? ` by ${data.updatedBy}` : ''}` +
          `${data.updatedAt ? ` on ${data.updatedAt}` : ''}.\n\n` +
          `Sign in to review: ${data.carePlanUrl || `${config.appUrl}/care-plans`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'A care plan has been updated',
          preheader: 'Sign in to Guardian to review the updated care plan.',
          body:
            paragraph(
              `The care plan for <strong>${escapeHtml(data.patientName)}</strong> has been updated.`
            ) +
            detailTable([
              ['Resident', data.patientName],
              ['Patient ID', data.patientId],
              ['Updated by', data.updatedBy],
              ['Updated at', data.updatedAt],
              ['Summary', data.changeSummary]
            ]) +
            paragraph(
              '<em>Clinical details are not included in this email. Sign in to the secure portal to view the full plan.</em>'
            ),
          buttonText: 'View care plan',
          buttonUrl: data.carePlanUrl || `${config.appUrl}/care-plans`
        })
      };
    }
  },

  'daily-report': {
    key: 'daily-report',
    name: 'Daily report ready',
    category: 'Care',
    description: 'Digest notification that a daily report is available.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('reportDate', 'Report date', { required: true, sample: '07 August 2026' }),
      field('patientName', 'Resident', { sample: 'Margaret Doyle' }),
      field('patientId', 'Patient ID', { sample: 'PT-000123' }),
      field('alertCount', 'Alerts raised', { type: 'number', sample: 2 }),
      field('taskCount', 'Tasks completed', { type: 'number', sample: 9 }),
      field('reportUrl', 'Report URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      return {
        subject: `Daily report for ${data.reportDate}`,
        preheader: `Your ${config.appName} daily report is ready.`,
        text:
          `Your daily report for ${data.reportDate} is ready.\n` +
          `${data.patientName ? `Resident: ${data.patientName}\n` : ''}` +
          `Alerts raised: ${data.alertCount || 0}\n` +
          `Tasks completed: ${data.taskCount || 0}\n\n` +
          `View: ${data.reportUrl || `${config.appUrl}/reports`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Your daily report is ready',
          preheader: `Your ${config.appName} daily report is ready.`,
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, here is the summary for ${escapeHtml(data.reportDate)}.`) +
            detailTable([
              ['Report date', data.reportDate],
              ['Resident', data.patientName],
              ['Patient ID', data.patientId],
              ['Alerts raised', data.alertCount],
              ['Tasks completed', data.taskCount]
            ]) +
            paragraph('Sign in to Guardian for the complete report.'),
          buttonText: 'View report',
          buttonUrl: data.reportUrl || `${config.appUrl}/reports`
        })
      };
    }
  },

  /* ------------------------------------------------------------------ */
  /* Appointments (Health)                                               */
  /* ------------------------------------------------------------------ */
  'appointment-reminder': {
    key: 'appointment-reminder',
    name: 'Appointment reminder',
    category: 'Health',
    description: 'Reminds a resident or carer of an upcoming appointment. Carries no clinical detail.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('appointmentType', 'Appointment type', { sample: 'GP review' }),
      field('clinician', 'With', { sample: 'Dr Sarah Nguyen' }),
      field('when', 'Date and time', { required: true, sample: '2026-08-20T09:30:00+08:00' }),
      field('location', 'Location', { sample: 'Northside Clinic, Room 4' }),
      field('appointmentUrl', 'Details URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const when = whenText(data.when, config);
      return {
        subject: `Reminder: ${data.appointmentType || 'appointment'} on ${when}`,
        preheader: `You have an upcoming ${data.appointmentType || 'appointment'}.`,
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `This is a reminder of your upcoming ${data.appointmentType || 'appointment'}.\n` +
          `When: ${when}\n` +
          `${data.clinician ? `With: ${data.clinician}\n` : ''}` +
          `${data.location ? `Where: ${data.location}\n` : ''}` +
          `\nManage this appointment: ${data.appointmentUrl || `${config.appUrl}/appointments`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Appointment reminder',
          preheader: `You have an upcoming ${data.appointmentType || 'appointment'}.`,
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, this is a reminder of your upcoming appointment.`) +
            callout('info', data.appointmentType || 'Appointment',
              `<strong>${escapeHtml(when)}</strong>`) +
            detailTable([
              ['Type', data.appointmentType],
              ['With', data.clinician],
              ['When', when],
              ['Where', data.location]
            ]) +
            paragraph('If you need to change or cancel, please use the button below or contact the clinic.'),
          buttonText: 'Manage appointment',
          buttonUrl: data.appointmentUrl || `${config.appUrl}/appointments`
        })
      };
    }
  },

  'appointment-confirmed': {
    key: 'appointment-confirmed',
    name: 'Appointment confirmed',
    category: 'Health',
    description: 'Confirms a newly booked appointment.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('appointmentType', 'Appointment type', { sample: 'GP review' }),
      field('clinician', 'With', { sample: 'Dr Sarah Nguyen' }),
      field('when', 'Date and time', { required: true, sample: '2026-08-20T09:30:00+08:00' }),
      field('location', 'Location', { sample: 'Northside Clinic, Room 4' }),
      field('appointmentUrl', 'Details URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const when = whenText(data.when, config);
      return {
        subject: `Confirmed: ${data.appointmentType || 'appointment'} on ${when}`,
        preheader: 'Your appointment is confirmed.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Your ${data.appointmentType || 'appointment'} is confirmed.\n` +
          `When: ${when}\n` +
          `${data.clinician ? `With: ${data.clinician}\n` : ''}` +
          `${data.location ? `Where: ${data.location}\n` : ''}`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Your appointment is confirmed',
          preheader: 'Your appointment is confirmed.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, your appointment has been booked.`) +
            callout('success', 'Confirmed', `<strong>${escapeHtml(when)}</strong>`) +
            detailTable([
              ['Type', data.appointmentType],
              ['With', data.clinician],
              ['When', when],
              ['Where', data.location]
            ]),
          buttonText: 'View appointment',
          buttonUrl: data.appointmentUrl || `${config.appUrl}/appointments`
        })
      };
    }
  },

  'appointment-cancelled': {
    key: 'appointment-cancelled',
    name: 'Appointment cancelled',
    category: 'Health',
    description: 'Notifies that an appointment has been cancelled or needs rebooking.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('appointmentType', 'Appointment type', { sample: 'GP review' }),
      field('when', 'Original date and time', { required: true, sample: '2026-08-20T09:30:00+08:00' }),
      field('reason', 'Reason', { sample: 'Clinician unavailable' }),
      field('rebookUrl', 'Rebook URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const when = whenText(data.when, config);
      return {
        subject: `Cancelled: ${data.appointmentType || 'appointment'} on ${when}`,
        preheader: 'Your appointment has been cancelled.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Your ${data.appointmentType || 'appointment'} scheduled for ${when} has been cancelled.\n` +
          `${data.reason ? `Reason: ${data.reason}\n` : ''}` +
          `\nRebook: ${data.rebookUrl || `${config.appUrl}/appointments`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          accentColour: SEVERITY_COLOURS.high,
          heading: 'Appointment cancelled',
          preheader: 'Your appointment has been cancelled.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, the following appointment has been cancelled.`) +
            callout('warning', data.reason ? `Reason: ${data.reason}` : 'Cancelled',
              `<strong>${escapeHtml(data.appointmentType || 'Appointment')}</strong> — ${escapeHtml(when)}`) +
            paragraph('You can book a new time using the button below.'),
          buttonText: 'Rebook appointment',
          buttonUrl: data.rebookUrl || `${config.appUrl}/appointments`
        })
      };
    }
  },

  'results-ready': {
    key: 'results-ready',
    name: 'Results ready',
    category: 'Health',
    description: 'Tells a resident or carer that results are available to view in the secure portal. Contains no clinical detail.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('resultType', 'Result type', { sample: 'test results' }),
      field('portalUrl', 'Portal URL', { type: 'url', required: true, sample: 'https://guardian.example.com/results' })
    ],
    build(data, config) {
      const kind = data.resultType || 'results';
      return {
        subject: `Your ${kind} are ready to view`,
        preheader: 'New results are available in your secure portal.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Your ${kind} are ready to view securely in ${config.appName}.\n` +
          `For your privacy, we do not include any detail in email.\n\n` +
          `View securely: ${data.portalUrl}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Your results are ready',
          preheader: 'New results are available in your secure portal.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, your ${escapeHtml(kind)} are now available to view.`) +
            callout('info', 'Kept private',
              'For your privacy, results are never included in email. Sign in to the secure portal to view them.') +
            paragraph('Please sign in to view them securely.'),
          buttonText: 'View securely',
          buttonUrl: data.portalUrl
        })
      };
    }
  },

  'secure-message': {
    key: 'secure-message',
    name: 'New secure message',
    category: 'Care',
    description: 'Notifies that a new message from the care team is waiting in the secure portal. No message content is included.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('fromName', 'From', { sample: 'Northside Care Team' }),
      field('messageUrl', 'Message URL', { type: 'url', required: true, sample: 'https://guardian.example.com/messages' })
    ],
    build(data, config) {
      const from = data.fromName || 'your care team';
      return {
        subject: `New message from ${from}`,
        preheader: 'You have a new secure message.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `You have a new secure message from ${from}.\n` +
          `For your privacy, the message is only available in the secure portal.\n\n` +
          `Read it: ${data.messageUrl}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'You have a new message',
          preheader: 'You have a new secure message.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, you have a new secure message from <strong>${escapeHtml(from)}</strong>.`) +
            callout('info', 'Secure message',
              'For your privacy, the message content is only available after you sign in.') +
            paragraph('Sign in to read and reply.'),
          buttonText: 'Read message',
          buttonUrl: data.messageUrl
        })
      };
    }
  },

  /* ------------------------------------------------------------------ */
  /* Security                                                            */
  /* ------------------------------------------------------------------ */
  'account-locked': {
    key: 'account-locked',
    name: 'Account locked',
    category: 'Security',
    description: 'Notifies a user that their account has been locked and how to regain access.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('reason', 'Reason', { sample: 'Too many failed sign-in attempts' }),
      field('unlockUrl', 'Unlock URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      return {
        subject: `${config.appName}: your account has been locked`,
        preheader: 'Action needed to restore access to your account.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Your ${config.appName} account has been locked.\n` +
          `${data.reason ? `Reason: ${data.reason}\n` : ''}` +
          `\nRestore access: ${data.unlockUrl || `${config.appUrl}/unlock`}\n` +
          `If this was not you, contact ${config.supportEmail}.\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          accentColour: SEVERITY_COLOURS.critical,
          heading: 'Your account has been locked',
          preheader: 'Action needed to restore access to your account.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')},`) +
            callout('critical', data.reason ? `Reason: ${data.reason}` : 'Account locked',
              'Your account has been locked to protect it. You can restore access using the button below.') +
            paragraph(`If you did not expect this, please contact <a href="mailto:${escapeHtml(config.supportEmail)}" style="color:${BRAND.link}">${escapeHtml(config.supportEmail)}</a> straight away.`),
          buttonText: 'Restore access',
          buttonUrl: data.unlockUrl || `${config.appUrl}/unlock`
        })
      };
    }
  },

  'suspicious-login': {
    key: 'suspicious-login',
    name: 'New sign-in detected',
    category: 'Security',
    description: 'Alerts a user to a new or unexpected sign-in on their account.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('when', 'When', { required: true, sample: '2026-08-08T21:14:00+08:00' }),
      field('location', 'Location', { sample: 'Perth, Australia' }),
      field('device', 'Device', { sample: 'Chrome on Windows' }),
      field('secureUrl', 'Secure account URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const when = whenText(data.when, config);
      return {
        subject: `${config.appName}: new sign-in to your account`,
        preheader: 'Review a recent sign-in to your account.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `We noticed a new sign-in to your ${config.appName} account.\n` +
          `When: ${when}\n` +
          `${data.location ? `Location: ${data.location}\n` : ''}` +
          `${data.device ? `Device: ${data.device}\n` : ''}` +
          `\nIf this was you, no action is needed. If not, secure your account: ${data.secureUrl || `${config.appUrl}/security`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'New sign-in detected',
          preheader: 'Review a recent sign-in to your account.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, we noticed a new sign-in to your account.`) +
            detailTable([
              ['When', when],
              ['Location', data.location],
              ['Device', data.device]
            ]) +
            callout('warning', 'Was this you?',
              'If you recognise this activity, you can ignore this email. If not, secure your account now.'),
          buttonText: 'Secure my account',
          buttonUrl: data.secureUrl || `${config.appUrl}/security`
        })
      };
    }
  },

  'two-factor-enabled': {
    key: 'two-factor-enabled',
    name: 'Two-factor enabled',
    category: 'Security',
    description: 'Confirms that two-factor authentication was turned on.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('when', 'When', { sample: '2026-08-08T21:14:00+08:00' })
    ],
    build(data, config) {
      const when = data.when ? whenText(data.when, config) : '';
      return {
        subject: `${config.appName}: two-factor authentication enabled`,
        preheader: 'Two-factor authentication is now on.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Two-factor authentication has been enabled on your ${config.appName} account${when ? ` on ${when}` : ''}.\n` +
          `If you did not do this, contact ${config.supportEmail}.\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Two-factor authentication is on',
          preheader: 'Two-factor authentication is now on.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')},`) +
            callout('success', 'Extra protection enabled',
              `Two-factor authentication is now active on your account${when ? ` (enabled ${escapeHtml(when)})` : ''}.`) +
            paragraph(`If you did not make this change, contact <a href="mailto:${escapeHtml(config.supportEmail)}" style="color:${BRAND.link}">${escapeHtml(config.supportEmail)}</a> immediately.`)
        })
      };
    }
  },

  /* ------------------------------------------------------------------ */
  /* Staff and billing                                                   */
  /* ------------------------------------------------------------------ */
  'shift-reminder': {
    key: 'shift-reminder',
    name: 'Shift reminder',
    category: 'Care',
    description: 'Reminds a staff member of an upcoming shift.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('shiftStart', 'Shift start', { required: true, sample: '2026-08-09T07:00:00+08:00' }),
      field('shiftEnd', 'Shift end', { sample: '2026-08-09T15:00:00+08:00' }),
      field('location', 'Location', { sample: 'East Wing' }),
      field('rosterUrl', 'Roster URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const start = whenText(data.shiftStart, config);
      const end = data.shiftEnd ? whenText(data.shiftEnd, config) : '';
      return {
        subject: `Shift reminder: ${start}`,
        preheader: 'You have an upcoming shift.',
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `This is a reminder of your upcoming shift.\n` +
          `Start: ${start}\n` +
          `${end ? `End: ${end}\n` : ''}` +
          `${data.location ? `Location: ${data.location}\n` : ''}` +
          `\nView roster: ${data.rosterUrl || `${config.appUrl}/roster`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Upcoming shift reminder',
          preheader: 'You have an upcoming shift.',
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, here are the details of your next shift.`) +
            detailTable([
              ['Starts', start],
              ['Ends', end],
              ['Location', data.location]
            ]),
          buttonText: 'View roster',
          buttonUrl: data.rosterUrl || `${config.appUrl}/roster`
        })
      };
    }
  },

  receipt: {
    key: 'receipt',
    name: 'Payment receipt',
    category: 'Billing',
    description: 'Confirms a payment and links to the full invoice.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('invoiceNumber', 'Invoice number', { required: true, sample: 'INV-2026-0042' }),
      field('amount', 'Amount', { required: true, sample: 'A$120.00' }),
      field('paidOn', 'Paid on', { sample: '2026-08-08' }),
      field('description', 'Description', { sample: 'Monthly monitoring subscription' }),
      field('invoiceUrl', 'Invoice URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const paidOn = data.paidOn ? whenText(data.paidOn, config, { dateOnly: true }) : '';
      return {
        subject: `Receipt for ${data.invoiceNumber} — ${data.amount}`,
        preheader: `Payment received: ${data.amount}.`,
        text:
          `Hello ${data.name || 'there'},\n\n` +
          `Thank you — we have received your payment.\n` +
          `Invoice: ${data.invoiceNumber}\n` +
          `Amount: ${data.amount}\n` +
          `${paidOn ? `Paid on: ${paidOn}\n` : ''}` +
          `${data.description ? `For: ${data.description}\n` : ''}` +
          `\nView invoice: ${data.invoiceUrl || `${config.appUrl}/billing`}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Payment received',
          preheader: `Payment received: ${data.amount}.`,
          body:
            paragraph(`Hello ${escapeHtml(data.name || 'there')}, thank you — your payment has been received.`) +
            callout('success', `Amount paid: ${data.amount}`, `Invoice <strong>${escapeHtml(data.invoiceNumber)}</strong>`) +
            detailTable([
              ['Invoice', data.invoiceNumber],
              ['Amount', data.amount],
              ['Paid on', paidOn],
              ['Description', data.description]
            ]) +
            paragraph('A copy of your full invoice is available using the button below.'),
          buttonText: 'View invoice',
          buttonUrl: data.invoiceUrl || `${config.appUrl}/billing`
        })
      };
    }
  },

  /* ------------------------------------------------------------------ */
  /* Testing                                                             */
  /* ------------------------------------------------------------------ */
  'custom-message': {
    key: 'custom-message',
    name: 'Custom message',
    category: 'Testing',
    description: 'Free-form subject and body inside the Guardian layout. Useful for smoke tests.',
    fields: [
      ...RECIPIENT_FIELDS,
      field('subject', 'Subject', { required: true, sample: 'Guardian email test' }),
      field('heading', 'Heading', { sample: 'Guardian email test' }),
      field('message', 'Message body', {
        type: 'textarea',
        required: true,
        sample: 'This is a test message sent from the Guardian email test console.'
      }),
      field('buttonText', 'Button text', { sample: '' }),
      field('buttonUrl', 'Button URL', { type: 'url', sample: '' })
    ],
    build(data, config) {
      const paragraphs = String(data.message || '')
        .split(/\n{2,}/)
        .map(block => paragraph(escapeHtml(block).replace(/\n/g, '<br>')))
        .join('');

      return {
        subject: data.subject,
        preheader: data.heading || data.subject,
        text: `${data.message}\n`,
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: data.heading || data.subject,
          preheader: data.heading || data.subject,
          body: paragraphs,
          buttonText: data.buttonText,
          buttonUrl: data.buttonUrl
        })
      };
    }
  },

  'render-check': {
    key: 'render-check',
    name: 'Rendering check',
    category: 'Testing',
    description:
      'Exercises every layout component at once — buttons, detail tables, code blocks, severity badges, long text and unicode.',
    fields: [...RECIPIENT_FIELDS],
    build(data, config) {
      return {
        subject: `${config.appName} rendering check`,
        preheader: 'Layout smoke test across all components.',
        text:
          'Guardian rendering check.\n\n' +
          'This message exercises every layout component. If you can read this line, the plain-text alternative is working.\n',
        html: baseTemplate({
          appName: config.appName,
          supportEmail: config.supportEmail,
          heading: 'Rendering check',
          preheader: 'Layout smoke test across all components.',
          body:
            paragraph(
              `Hello ${escapeHtml(data.name || 'there')}, this message exercises every component in the Guardian email layout so you can check how it renders in a real client.`
            ) +
            `<p style="margin:0 0 16px 0">${severityBadge('low')} ${severityBadge('medium')} ${severityBadge('high')} ${severityBadge('critical')}</p>` +
            detailTable([
              ['Short value', 'OK'],
              ['Long value', 'A deliberately long value to check how the detail table wraps on narrow mobile screens'],
              ['Unicode', 'ÀÉÎÕÜ — “curly quotes” … ✓ 日本語'],
              ['Numeric', '1,234,567']
            ]) +
            codeBlock('123456') +
            paragraph(
              'Lorem-style filler to check line height and paragraph spacing. ' +
                'Email clients vary in how they collapse margins, so this paragraph is intentionally long enough to wrap across several lines on both desktop and mobile viewports.'
            ),
          buttonText: 'Test button',
          buttonUrl: config.appUrl
        })
      };
    }
  }
};

function listTemplates() {
  return Object.values(TEMPLATES).map(template => ({
    key: template.key,
    name: template.name,
    category: template.category,
    description: template.description,
    fields: template.fields
  }));
}

function getTemplate(type) {
  const template = TEMPLATES[type];

  if (!template) {
    const error = new Error(
      `Unknown email template "${type}". Available: ${Object.keys(TEMPLATES).join(', ')}.`
    );
    error.statusCode = 400;
    throw error;
  }

  return template;
}

/**
 * Returns the sample payload declared by a template's field metadata.
 */
function getTemplateSample(type) {
  const template = getTemplate(type);

  return template.fields.reduce((acc, f) => {
    if (f.sample !== '' && f.sample !== undefined) acc[f.name] = f.sample;
    return acc;
  }, {});
}

/**
 * Builds subject/html/text for a template.
 */
function buildEmailTemplate(type, data, config) {
  const template = getTemplate(type);

  const missing = template.fields
    .filter(f => f.required)
    .map(f => f.name)
    .filter(nameKey => data[nameKey] === undefined || data[nameKey] === null || data[nameKey] === '');

  if (missing.length) {
    const error = new Error(`Missing required fields for template "${type}": ${missing.join(', ')}.`);
    error.statusCode = 400;
    error.fields = missing;
    throw error;
  }

  const built = template.build(data, config);

  return {
    template: type,
    subject: built.subject,
    html: built.html,
    text: built.text,
    preheader: built.preheader
  };
}

module.exports = {
  TEMPLATES,
  listTemplates,
  getTemplate,
  getTemplateSample,
  buildEmailTemplate
};
