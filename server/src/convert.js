// Conversion engine: a PDF buffer to Markdown, in-process, deterministic.
// pdfjs-dist legacy build (no canvas). Hostile input is bounded: max pages, max size, a
// conversion timeout, depth-limited line grouping and no eval (isEvalSupported: false).
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export const LIMITS = { maxBytes: 25 * 1024 * 1024, maxPages: 200, timeoutMs: 30_000, maxMarkdownBytes: 5 * 1024 * 1024 };

export class ConvertError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Escapes characters that markdown would read as markup, so a PDF's text cannot forge headings or links.
export function escapeMd(s) {
  return String(s).replace(/([\\`*_{}\[\]()#+!<>|~-])/g, '\\$1');
}

export function filenameToTitle(name) {
  return escapeMd(String(name || '').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled document');
}

// One page's items -> lines [{y, size, text}] grouped by baseline y (depth-limited, ordered).
export function itemsToLines(items) {
  const raw = [];
  for (const it of items) {
    const str = typeof it.str === 'string' ? it.str : '';
    if (!str.trim()) continue;
    const size = Math.abs(Number(it.transform?.[3])) || 10;
    const y = Number(it.transform?.[5]) || 0;
    const x = Number(it.transform?.[4]) || 0;
    raw.push({ y, x, size, str });
  }
  raw.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines = [];
  for (const it of raw) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= Math.max(2, it.size * 0.4)) {
      last.text += (it.str.startsWith(' ') || last.text.endsWith(' ') ? '' : ' ') + it.str;
      last.size = Math.max(last.size, it.size);
    } else lines.push({ y: it.y, x: it.x, size: it.size, text: it.str });
  }
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
}

const BULLET = /^([-•·▪◦*])\s+/;

// Lines -> markdown with size-tier headings, paragraphs, bullets and page separators.
export function linesToMarkdown(pages) {
  const sizes = pages.flat().map((l) => l.size).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10;
  const tier = (size, indexInPage) => {
    if (size >= median * 1.6) return indexInPage <= 1 ? 1 : 2; // # at page top, ## lower down
    if (size >= median * 1.15) return 2;
    if (size >= median * 1.07) return 3;
    return 0;
  };
  const out = [];
  pages.forEach((lines, pi) => {
    if (pi > 0) { out.push(''); out.push('---'); out.push(''); }
    let para = [];
    const flush = () => {
      if (!para.length) return;
      out.push(para.join(' ').replace(/\s+/g, ' ').trim());
      out.push('');
      para = [];
    };
    lines.forEach((line, li) => {
      const t = line.text;
      const b = BULLET.exec(t);
      if (b) {
        flush();
        out.push(`- ${escapeMd(t.slice(b[0].length).trim())}`);
        return;
      }
      const h = tier(line.size, li);
      if (h) {
        flush();
        out.push(`${'#'.repeat(h)} ${escapeMd(t)}`);
        out.push('');
        return;
      }
      // A new indent, or the previous line ending a sentence, starts a paragraph.
      if (para.length && (/[.!?:]$/.test(para[para.length - 1]) || (li > 0 && line.x - lines[li - 1].x > median * 1.5))) flush();
      para.push(escapeMd(t));
    });
    flush();
  });
  const md = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n?---\n(#{1,3} )/g, '\n---\n$1').trim() + '\n';
  if (Buffer.byteLength(md) > LIMITS.maxMarkdownBytes) throw new ConvertError('output_too_large', `markdown output exceeds ${LIMITS.maxMarkdownBytes} bytes`);
  return md;
}

export function statsFor(markdown, pageCount, ms) {
  const headings = (markdown.match(/^#{1,6} /gm) || []).length;
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return { pages: pageCount, headings, words, ms };
}

// The whole conversion. data: Buffer of the PDF. Bounded: pages, size, timeout.
export async function convertPdf(data, { filename = 'document.pdf', timeoutMs = LIMITS.timeoutMs, maxPages = LIMITS.maxPages } = {}) {
  if (!data || !data.length) throw new ConvertError('empty_file', 'the file is empty');
  if (data.length > LIMITS.maxBytes) throw new ConvertError('file_too_large', `file exceeds ${LIMITS.maxBytes} bytes`);
  if (data.length < 5 || !data.subarray(0, 5).toString('latin1').startsWith('%PDF-')) throw new ConvertError('not_a_pdf', 'not a PDF file (missing %PDF- header)');
  const started = Date.now();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  } catch (e) {
    throw new ConvertError('parse_failed', `the PDF could not be parsed: ${String(e?.message || e).slice(0, 200)}`);
  }
  try {
    const pageCount = Math.min(doc.numPages, maxPages);
    const pages = [];
    for (let p = 1; p <= pageCount; p++) {
      if (Date.now() - started > timeoutMs) throw new ConvertError('timeout', `conversion exceeded ${timeoutMs} ms`);
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      pages.push(itemsToLines(tc.items));
      page.cleanup?.();
    }
    const body = linesToMarkdown(pages);
    const title = filenameToTitle(filename);
    const md = pages.flat().length ? `# ${title}\n\n${body}` : `# ${title}\n\n(no extractable text: the PDF may be image-only)\n`;
    return { markdown: md, stats: statsFor(md, doc.numPages, Date.now() - started) };
  } finally {
    doc.destroy?.();
  }
}
