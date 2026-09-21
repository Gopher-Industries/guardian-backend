/**
 * Guardian API — swagger.js
 *
 * Single source of truth for the OpenAPI/Swagger spec. Used by the running
 * server (Swagger UI, Redoc, /openapi.json) and by scripts/generate-openapi.js
 * and scripts/generate-postman.js, so the interactive docs, the exported spec
 * and the Postman collection can never drift apart.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

const swaggerJsdoc = require('swagger-jsdoc');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Guardian API',
      version: '1.0.0',
      description:
        'Guardian Monitoring backend API. Authenticate via POST /api/v1/auth/login ' +
        'to obtain a JWT, then send it as an `Authorization: Bearer <token>` header.'
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development' },
      { url: 'https://guardian-backend-xi.vercel.app', description: 'Production (Vercel)' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: [
    './src/routes/*.js',
    './src/routes/**/*.js',
    './src/controllers/*.js',
    './src/swaggerDefinitions.js'
  ]
};

/**
 * Builds the full OpenAPI spec from the JSDoc annotations and applies the
 * email-endpoint enhancements (template dropdown, provider list).
 */
function buildSwaggerSpec() {
  const spec = swaggerJsdoc(swaggerOptions);
  try {
    const { augmentEmailDocs } = require('./swaggerEmail');
    augmentEmailDocs(spec);
  } catch (error) {
    // Non-fatal: the base spec is still valid without the email extras.
    console.warn('Swagger email augmentation skipped:', error.message);
  }
  return spec;
}

module.exports = { swaggerOptions, buildSwaggerSpec };
