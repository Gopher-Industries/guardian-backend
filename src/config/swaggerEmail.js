/**
 * Guardian Email Service — swaggerEmail.js
 *
 * Enriches the generated Swagger/OpenAPI spec for the email endpoints so the
 * interactive docs (/swaggerDocs) let you test every template: the `template`
 * field becomes a dropdown of all available templates, and every provider
 * (including smtp) is offered as a per-request override. Kept in sync with the
 * template registry automatically.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

const { listTemplates } = require('../services/emailService');

const PROVIDER_ENUM = ['resend', 'brevo', 'mailersend', 'smtp', 'dryrun'];
const SEND_PROVIDER_ENUM = ['brevo'];

function jsonSchemaOf(spec, path) {
  const op = spec && spec.paths && spec.paths[path] && spec.paths[path].post;
  const content = op && op.requestBody && op.requestBody.content;
  const json = content && content['application/json'];
  return (json && json.schema) || null;
}

function openApiField(field, defaultRecipient) {
  const schema = {
    type: field.type === 'number' ? 'number' : 'string',
    description: [
      field.label,
      field.help,
      field.required ? 'Required for this template.' : ''
    ].filter(Boolean).join(' ')
  };

  if (field.type === 'email') schema.format = 'email';
  if (field.type === 'url') schema.format = 'uri';
  if (field.choices && field.choices.length) schema.enum = field.choices;

  const sample = field.name === 'to' ? defaultRecipient : field.sample;
  if (sample !== undefined && sample !== '') {
    schema.example = sample;
    schema.default = sample;
  }

  return schema;
}

function templateFieldMap(templates) {
  return Object.fromEntries(
    templates.map(template => [template.key, template.fields.map(field => field.name)])
  );
}

/** Builds the plain form schema that Swagger UI renders as individual fields. */
function templateFormSchema(templates) {
  const defaultRecipient = process.env.EMAIL_TEST_RECIPIENT || 'test@example.com';
  const fields = new Map();

  templates.forEach(template => {
    template.fields.forEach(field => {
      if (!fields.has(field.name)) fields.set(field.name, field);
    });
  });

  const properties = {
    template: {
      type: 'string',
      enum: templates.map(template => template.key),
      default: templates[0] && templates[0].key,
      description: 'Select a template to show the fields used by that email.'
    }
  };

  fields.forEach((field, name) => {
    properties[name] = openApiField(field, defaultRecipient);
  });

  properties.provider = {
    type: 'string',
    enum: SEND_PROVIDER_ENUM,
    default: 'brevo',
    description: 'Guardian currently sends transactional email through Brevo.'
  };
  properties.dryRun = {
    type: 'boolean',
    default: false,
    description: 'Leave false to send through Brevo. Set true to render and record without delivery.'
  };

  return {
    type: 'object',
    required: ['template', 'to'],
    properties
  };
}

function addSendForm(spec, templates) {
  const operation = spec.paths['/api/v1/email/send'] && spec.paths['/api/v1/email/send'].post;
  const requestBody = operation && operation.requestBody;
  if (!requestBody) return;

  const existingContent = requestBody.content || {};
  requestBody.description =
    'Choose the required template form, complete its displayed fields, and send it through Brevo.';
  operation['x-guardian-template-fields'] = templateFieldMap(templates);
  requestBody.content = {
    'multipart/form-data': {
      schema: templateFormSchema(templates)
    },
    ...existingContent
  };
}

/**
 * Mutates and returns the spec. Safe to call with a partial or empty spec —
 * missing paths are simply skipped.
 */
function augmentEmailDocs(spec) {
  if (!spec || !spec.paths) return spec;

  const templates = listTemplates();
  const templateKeys = templates.map(t => t.key);

  // Turn the free-text template field into a dropdown of every template.
  ['/api/v1/email/send', '/api/v1/email/preview', '/api/v1/email/send-bulk'].forEach(path => {
    const schema = jsonSchemaOf(spec, path);
    if (schema && schema.properties && schema.properties.template) {
      schema.properties.template.enum = templateKeys;
      schema.properties.template.description =
        'Choose a template. Set the recipient in data.to and edit content via the data fields ' +
        '(call GET /api/v1/email/templates/{type}/sample for a ready-made payload).';
    }
  });


  // The /send-option endpoint uses an `option` field instead of `template`.
  ['/api/v1/email/send-option'].forEach(path => {
    const schema = jsonSchemaOf(spec, path);
    if (schema && schema.properties && schema.properties.option) {
      schema.properties.option.enum = templateKeys;
    }
  });

  // Make /send usable as a field-based form while retaining application/json
  // in the specification for existing API clients.
  addSendForm(spec, templates);

  // Offer every provider as a per-request override, including smtp (Mailpit).
  ['/api/v1/email/send', '/api/v1/email/send-raw', '/api/v1/email/send-bulk',
   '/api/v1/email/test', '/api/v1/email/verify-connection'].forEach(path => {
    const schema = jsonSchemaOf(spec, path);
    if (schema && schema.properties && schema.properties.provider) {
      schema.properties.provider.enum = PROVIDER_ENUM;
    }
  });

  return spec;
}

module.exports = { augmentEmailDocs, PROVIDER_ENUM };
