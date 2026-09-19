const fs = require('fs/promises');
const path = require('path');

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 48;
const RIGHT = 48;
const TOP = 54;
const BOTTOM = 48;
const LINE_HEIGHT = 15;
const MAX_CHARS = 86;

function pdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ')
    // Helvetica's WinAnsi encoding cannot represent every Unicode character.
    .replace(/[^\x20-\x7e]/g, '?');
}

function wrap(text, maxChars = MAX_CHARS) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ');
  if (!words[0]) return [''];

  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= maxChars) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

function createPdfBuffer(sections) {
  const pages = [[]];
  let y = PAGE_HEIGHT - TOP;
  let pageNumber = 1;

  const nextPage = () => {
    pages.push([]);
    pageNumber += 1;
    y = PAGE_HEIGHT - TOP;
  };

  const writeLine = (text, size = 10) => {
    if (y < BOTTOM + LINE_HEIGHT) nextPage();
    pages[pages.length - 1].push(
      `BT /F1 ${size} Tf ${LEFT} ${y} Td (${pdfText(text)}) Tj ET`
    );
    y -= LINE_HEIGHT;
  };

  for (const section of sections) {
    if (section.heading) {
      if (y < BOTTOM + LINE_HEIGHT * 3) nextPage();
      writeLine(section.heading, 13);
    }
    for (const item of section.lines || []) {
      for (const line of wrap(item)) writeLine(line);
    }
    y -= 6;
  }

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];

  for (const pageLines of pages) {
    const footer = `BT /F1 8 Tf ${LEFT} 28 Td (Page ${pageIds.length + 1}) Tj ET`;
    const content = `${pageLines.join('\n')}\n${footer}`;
    const contentId = addObject(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function saveDailyReportPdf({ fileName, sections }) {
  const reportDirectory = path.resolve(__dirname, '../../uploads/daily-reports');
  const filePath = path.join(reportDirectory, fileName);
  await fs.mkdir(reportDirectory, { recursive: true });
  await fs.writeFile(filePath, createPdfBuffer(sections));
  return filePath;
}

module.exports = { createPdfBuffer, saveDailyReportPdf };
