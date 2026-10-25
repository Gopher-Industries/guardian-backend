/**
 * Guardian API — generate-postman.js
 *
 * Converts the live OpenAPI spec into a Postman v2.1 collection that students
 * can import and use immediately: a {{baseUrl}} variable, collection-level
 * bearer auth using a {{token}} variable, endpoints grouped into folders by
 * tag, and a Login request that captures the token automatically.
 * Run: npm run postman:generate
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

const fs = require('fs');
const path = require('path');
const { buildSwaggerSpec } = require('../src/config/swagger');

const spec = buildSwaggerSpec();

// Endpoints that must NOT send the bearer token (they issue or predate it).
const PUBLIC = [
  ['post', '/api/v1/auth/login'],
  ['post', '/api/v1/auth/register'],
  ['post', '/api/v1/auth/send-pin'],
  ['post', '/api/v1/auth/verify-pin'],
  ['post', '/api/v1/auth/reset-password-request'],
  ['get', '/api/v1/auth/reset-password'],
  ['post', '/api/v1/auth/reset-password']
];
const isPublic = (m, p) => PUBLIC.some(([mm, pp]) => mm === m && pp === p);

function exampleFromSchema(schema) {
  if (!schema || typeof schema !== 'object') return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.properties) {
    const obj = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.example !== undefined) obj[key] = prop.example;
      else if (prop.type === 'object') obj[key] = exampleFromSchema(prop) || {};
      else if (prop.type === 'array') obj[key] = [];
      else if (prop.enum) obj[key] = prop.enum[0];
      else obj[key] = prop.type === 'number' || prop.type === 'integer' ? 0 : (prop.type === 'boolean' ? false : '');
    }
    return obj;
  }
  return undefined;
}

function toPostmanPath(p) {
  // /api/v1/email/inbox/{id} -> segments with :id
  return p.replace(/^\//, '').split('/').map(seg => seg.replace(/^\{(.+)\}$/, ':$1'));
}

function buildRequest(method, p, op) {
  const segments = toPostmanPath(p);
  const params = op.parameters || [];
  const query = params.filter(x => x.in === 'query').map(x => ({ key: x.name, value: '', disabled: true, description: x.description || '' }));
  const pathVars = params.filter(x => x.in === 'path').map(x => ({ key: x.name, value: '', description: x.description || '' }));

  const url = {
    raw: '{{baseUrl}}/' + segments.join('/') + (query.length ? '?' + query.map(q => q.key + '=').join('&') : ''),
    host: ['{{baseUrl}}'],
    path: segments
  };
  if (query.length) url.query = query;
  if (pathVars.length) url.variable = pathVars;

  const request = { method: method.toUpperCase(), header: [], url, description: op.description || '' };

  const jsonBody = op.requestBody && op.requestBody.content && op.requestBody.content['application/json'];
  if (jsonBody) {
    const example = exampleFromSchema(jsonBody.schema);
    request.header.push({ key: 'Content-Type', value: 'application/json' });
    request.body = { mode: 'raw', raw: JSON.stringify(example ?? {}, null, 2), options: { raw: { language: 'json' } } };
  }

  if (isPublic(method, p)) request.auth = { type: 'noauth' };

  const item = { name: op.summary || `${method.toUpperCase()} ${p}`, request, response: [] };

  // Auto-capture the token after a successful login.
  if (method === 'post' && p === '/api/v1/auth/login') {
    item.event = [{
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          'try {',
          '  const j = pm.response.json();',
          '  const t = j.token || j.accessToken || (j.data && j.data.token);',
          "  if (t) { pm.collectionVariables.set('token', t); console.log('Saved token'); }",
          '} catch (e) { console.log('+"'Login response was not JSON'"+'); }'
        ]
      }
    }];
  }

  return item;
}

// Group operations into folders by their first tag.
const folders = {};
for (const [p, methods] of Object.entries(spec.paths || {})) {
  for (const [method, op] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    const tag = (op.tags && op.tags[0]) || 'General';
    (folders[tag] = folders[tag] || []).push(buildRequest(method, p, op));
  }
}

const collection = {
  info: {
    name: (spec.info && spec.info.title) || 'Guardian API',
    _postman_id: '00000000-0000-4000-8000-000000000001',
    description:
      ((spec.info && spec.info.description) || '') +
      '\n\nHow to use: set {{baseUrl}} (default http://localhost:3000), then run ' +
      'Authentication → "User login" to capture your token automatically. All ' +
      'other requests then send it as a Bearer token.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000' },
    { key: 'token', value: '' }
  ],
  item: Object.keys(folders).sort().map(tag => ({ name: tag, item: folders[tag] }))
};

const outFile = path.join(__dirname, '..', 'guardian-postman-collection.json');
fs.writeFileSync(outFile, JSON.stringify(collection, null, 2));

const count = Object.values(folders).reduce((n, arr) => n + arr.length, 0);
console.log(`Wrote ${outFile}`);
console.log(`  ${Object.keys(folders).length} folders, ${count} requests`);
