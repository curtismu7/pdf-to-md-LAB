// Unit tests for the conversion engine (pdfjs-dist extraction + markdown heuristics).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertPdf, ConvertError, escapeMd, filenameToTitle, itemsToLines, linesToMarkdown } from '../src/convert.js';
import { buildSamplePdf, readSamplePdf } from '../assets/generator.mjs';

test('the sample PDF converts to the expected structure', async () => {
  const r = await convertPdf(buildSamplePdf(), { filename: 'q3.pdf' });
  assert.match(r.markdown, /^# q3\n\n# Quarterly Report/);
  assert.match(r.markdown, /## Overview/);
  assert.match(r.markdown, /## Highlights/);
  assert.match(r.markdown, /- Signed twelve new enterprise customers\./);
  assert.match(r.markdown, /---/);
  assert.equal(r.stats.pages, 2);
  assert.ok(r.stats.headings >= 4);
  assert.ok(r.stats.words > 40);
});

test('the bundled sample.pdf file converts identically', async () => {
  const r = await convertPdf(readSamplePdf(), { filename: 'sample.pdf' });
  assert.equal(r.stats.pages, 2);
  assert.match(r.markdown, /# Quarterly Report/);
});

test('markdown is escaped: markup characters in PDF text cannot forge structure', () => {
  const lines = [[
    { y: 100, x: 0, size: 20, text: 'Fake <script>alert(1)</script>' },
    { y: 90, x: 0, size: 11, text: '[link](http://x.invalid) # not a heading *bold*' },
  ]];
  const md = linesToMarkdown(lines);
  assert.ok(md.includes('\\# not a heading'));
  assert.ok(md.includes('\\[link\\]'));
  assert.ok(!md.includes('<script>'));
});

test('bullets are detected for -, •, · and *', () => {
  const lines = [[
    { y: 100, x: 0, size: 11, text: '- alpha' },
    { y: 90, x: 0, size: 11, text: '• beta' },
    { y: 80, x: 0, size: 11, text: '· gamma' },
    { y: 70, x: 0, size: 11, text: '* delta' },
  ]];
  const bullets = (linesToMarkdown(lines).match(/^- /gm) || []).length;
  assert.equal(bullets, 4);
});

test('items on one baseline group into a line, ordered left to right', () => {
  const lines = itemsToLines([
    { str: 'world', transform: [1, 0, 0, 10, 60, 100] },
    { str: 'hello', transform: [1, 0, 0, 10, 10, 100] },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, 'hello world');
});

test('filename to title: separators become spaces, extension dropped, length capped', () => {
  assert.equal(filenameToTitle('my_2026-report.pdf'), 'my 2026 report');
  assert.equal(filenameToTitle(''), 'Untitled document');
  assert.equal(filenameToTitle('x'.repeat(300)).length <= 120, true);
  assert.equal(escapeMd('a*b'), 'a\\*b');
});

test('empty file, no PDF header and unparseable data are named errors', async () => {
  await assert.rejects(convertPdf(Buffer.alloc(0)), (e) => e instanceof ConvertError && e.code === 'empty_file');
  await assert.rejects(convertPdf(Buffer.from('hello world')), (e) => e.code === 'not_a_pdf');
  await assert.rejects(convertPdf(Buffer.from('%PDF-not really')), (e) => e.code === 'parse_failed');
  await assert.rejects(convertPdf(Buffer.alloc(26 * 1024 * 1024, 65)), (e) => e.code === 'file_too_large');
});
