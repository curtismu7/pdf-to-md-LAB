// The bundled sample PDF generator: writes a tiny 2-page hand-written PDF (no dependencies)
// and its canned mock markdown. Run directly: node scripts/make-sample.mjs
import fs from 'node:fs';
import path from 'node:path';

const ESC = (s) => s.replace(/([\\()])/g, '\\$1');
const line = (x, y, size, font, text) => `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${ESC(text)}) Tj ET`;

function page(content) {
  return `BT /F1 12 Tf 14 TL ET\n${content}\n`;
}

export function buildSamplePdf() {
  const pages = [
    page([
      line(72, 740, 20, 'F2', 'Quarterly Report'),
      line(72, 716, 13, 'F2', 'Overview'),
      line(72, 696, 11, 'F1', 'Revenue grew steadily across every region this quarter.'),
      line(72, 680, 11, 'F1', 'Operating costs stayed flat while demand increased.'),
      line(72, 656, 13, 'F2', 'Highlights'),
      line(82, 636, 11, 'F1', '- Signed twelve new enterprise customers.'),
      line(82, 620, 11, 'F1', '- Shipped the mobile app to general availability.'),
      line(82, 604, 11, 'F1', '- Reduced support backlog by forty percent.'),
    ].join('\n')),
    page([
      line(72, 740, 20, 'F2', 'Quarterly Report'),
      line(72, 716, 13, 'F2', 'Outlook'),
      line(72, 696, 11, 'F1', 'Next quarter focuses on international expansion.'),
      line(72, 680, 11, 'F1', 'Hiring plans continue with a focus on customer success.'),
    ].join('\n')),
  ];
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R /F2 9 0 R >> >> /Contents 4 0 R >>',
    null, // 4: content stream (page 1)
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R /F2 9 0 R >> >> /Contents 6 0 R >>',
    null, // 6: content stream (page 2)
    '<< /Type /Info /Title (sample) >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  const streams = { 4: pages[0], 6: pages[1] };
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objs.length; i++) {
    const n = i + 1;
    offsets[n] = out.length;
    if (streams[n]) {
      const s = streams[n];
      out += `${n} 0 obj\n<< /Length ${s.length} >>\nstream\n${s}\nendstream\nendobj\n`;
    } else {
      out += `${n} 0 obj\n${objs[i]}\nendobj\n`;
    }
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export const SAMPLE_MD = `# Quarterly Report

## Overview

Revenue grew steadily across every region this quarter.

Operating costs stayed flat while demand increased.

## Highlights

- Signed twelve new enterprise customers.
- Shipped the mobile app to general availability.
- Reduced support backlog by forty percent.

---

# Quarterly Report

## Outlook

Next quarter focuses on international expansion.

Hiring plans continue with a focus on customer success.
`;

export function writeSample(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'sample.pdf');
  fs.writeFileSync(file, buildSamplePdf());
  return file;
}

export function readSamplePdf() {
  return fs.readFileSync(new URL('./sample.pdf', import.meta.url));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'server', 'assets');
  console.log(writeSample(dir));
}
