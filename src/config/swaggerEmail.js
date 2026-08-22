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

function jsonSchemaOf(spec, path) {
  const op = spec && spec.paths && spec.paths[path] && spec.paths[path].post;
  const content = op && op.requestBody && op.requestBody.content;
  const json = content && content['application/json'];
  return (json && json.schema) || null;
}

/**
 * Mutates and returns the spec. Safe to call with a partial or empty spec —
 * missing paths are simply skipped.
 */
function augmentEmailDocs(spec) {
  if (!spec || !spec.paths) return spec;

  const templateKeys = listTemplates().map(t => t.key);

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
