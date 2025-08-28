// scripts/export-swagger.js  (CommonJS)
const fs = require('fs');
const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'Guardian API', version: '1.0.0' },
    components: { schemas: {} }
  },
  
  apis: [
    path.join(__dirname, '../src/controllers/**/*.js'),
    path.join(__dirname, '../src/routes/**/*.js')
  ],
  // Throw if a file has a malformed @swagger block
  failOnErrors: true
};

const spec = swaggerJSDoc(options);

// Diagnostics
const pathsCount = spec.paths ? Object.keys(spec.paths).length : 0;
console.log(`Found ${pathsCount} path(s) from swagger comments`);

const outDir = path.join(__dirname, '../swagger-out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, 'swagger.json');
fs.writeFileSync(outFile, JSON.stringify(spec, null, 2));
console.log('Wrote', outFile);
