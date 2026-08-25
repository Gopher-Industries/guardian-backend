/**
 * Guardian Email Service — render-all-templates.js
 *
 * Developer utility that renders every email template from its sample data into tmp/ for visual inspection.
 *
 * Author: Graeme Thomas
 * Date:   2026-08-08
 */

/**
 * Renders every template with its sample data to tmp/email-preview/
 * and writes an index page. Sends nothing. Run: node scripts/render-all-templates.js
 */
require('dotenv').config();

process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'dryrun';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@guardian.local';
process.env.APP_NAME = process.env.APP_NAME || 'Guardian Monitor';

const fs = require('fs');
const path = require('path');
const { listTemplates, getTemplateSample, renderTemplate } = require('../src/services/emailService');

const outDir = path.join(__dirname, '..', 'tmp', 'email-preview');
fs.mkdirSync(outDir, { recursive: true });

const rows = [];

for (const template of listTemplates()) {
  const data = { to: 'preview@example.com', ...getTemplateSample(template.key) };
  const rendered = renderTemplate(template.key, data);

  fs.writeFileSync(path.join(outDir, `${template.key}.html`), rendered.html);
  fs.writeFileSync(path.join(outDir, `${template.key}.txt`), rendered.text);

  rows.push(
    `<tr><td><a href="${template.key}.html" target="p">${template.key}</a></td>` +
    `<td>${template.category}</td><td>${rendered.subject}</td>` +
    `<td><a href="${template.key}.txt" target="p">txt</a></td></tr>`
  );
}

fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html>
<meta charset="utf-8"><title>Guardian email previews</title>
<style>body{font-family:'JetBrains Mono',monospace;background:#14171c;color:#d5dae1;margin:0;display:flex;height:100vh}
nav{width:520px;overflow:auto;padding:16px;border-right:1px solid #2e353f}
table{width:100%;border-collapse:collapse;font-size:12px}td{padding:6px;border-bottom:1px solid #2e353f}
a{color:#4fc3c3}iframe{flex:1;border:0;background:#fff}</style>
<nav><h3>${rows.length} templates</h3><table>${rows.join('')}</table></nav>
<iframe name="p"></iframe>`);

console.log(`Rendered ${rows.length} templates to ${outDir}`);
