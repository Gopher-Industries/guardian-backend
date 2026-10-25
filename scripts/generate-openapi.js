/**
 * Guardian API — generate-openapi.js
 *
 * Writes the live OpenAPI spec (generated from the code's JSDoc annotations)
 * to src/openapi.json, so the committed spec, Redoc and any downloaded copy
 * stay accurate. Run: npm run openapi:generate
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildSwaggerSpec } = require('../src/config/swagger');

const spec = buildSwaggerSpec();
const outFile = path.join(__dirname, '..', 'src', 'openapi.json');
fs.writeFileSync(outFile, JSON.stringify(spec, null, 2));

const paths = Object.keys(spec.paths || {}).length;
const ops = Object.values(spec.paths || {}).reduce((n, p) => n + Object.keys(p).length, 0);
console.log(`Wrote ${outFile}`);
console.log(`  ${paths} paths, ${ops} operations, ${Object.keys(spec.components?.schemas || {}).length} schemas`);
