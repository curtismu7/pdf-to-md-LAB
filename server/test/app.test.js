// convert.js holds the pdfjs-dist extraction + markdown heuristics and its tests.
// These API-level tests cover the Express endpoints around it.
import { testServer, multipartBody, samplePdf } from './helpers.js';
import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';

test('POST /api/convert: headings, bullets and paragraphs from the fixture PDF', async (t) => {
  const s = await testServer(t);
  const { body, contentType } = multipartBody('report.pdf', samplePdf());
  const r = await s.write('/api/convert', body, { 'content-type': contentType });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.match(j.markdown, /^# report\n/);
  assert.match(j.markdown, /# Quarterly Report/);
  assert.match(j.markdown, /## Overview/);
  assert.match(j.markdown, /## Highlights/);
  assert.match(j.markdown, /- Signed twelve new enterprise customers\./);
  assert.match(j.markdown, /Revenue grew steadily across every region this quarter\./);
  assert.match(j.markdown, /---/);
  assert.equal(j.stats.pages, 2);
  assert.ok(j.stats.headings >= 3);
  assert.ok(j.stats.words > 30);
  assert.ok(j.id);
});

test('hostile input: an oversized file is refused with 413 JSON', async (t) => {
  const s = await testServer(t);
  const big = Buffer.concat([samplePdf(), Buffer.alloc(26 * 1024 * 1024, 65)]);
  const { body, contentType } = multipartBody('big.pdf', big);
  const r = await s.write('/api/convert', body, { 'content-type': contentType });
  assert.equal(r.status, 413);
  const j = await r.json();
  assert.equal(j.error, 'file_too_large');
  assert.ok(j.message);
});

test('hostile input: a wrong-extension upload is refused with 415', async (t) => {
  const s = await testServer(t);
  const { body, contentType } = multipartBody('notes.txt', Buffer.from('just text'));
  const r = await s.write('/api/convert', body, { 'content-type': contentType });
  assert.equal(r.status, 415);
  assert.equal((await r.json()).error, 'bad_file_type');
});

test('hostile input: garbage bytes with a .pdf name are refused with 415/422, never a crash', async (t) => {
  const s = await testServer(t);
  const garbage = Buffer.from([...Array(4096)].map(() => Math.floor(Math.random() * 256)));
  for (const data of [garbage, Buffer.from('%PDF-not really')]) {
    const { body, contentType } = multipartBody('garbage.pdf', data);
    const r = await s.write('/api/convert', body, { 'content-type': contentType });
    assert.ok([415, 422].includes(r.status), `status ${r.status}`);
    const j = await r.json();
    assert.ok(j.error && j.message, JSON.stringify(j).slice(0, 80));
  }
});

test('hostile input: a non-multipart write is a 400 JSON error', async (t) => {
  const s = await testServer(t);
  const r = await s.write('/api/convert', Buffer.from('%PDF-1.4'), { 'content-type': 'application/pdf' });
  assert.equal(r.status, 400);
  assert.ok((await r.json()).message);
});

test('Host guard: a non-loopback Host header is a 403 JSON error', async (t) => {
  const s = await testServer(t);
  const status = await new Promise((resolve) => {
    const req = http.request(`${s.base}/api/download/nope`, { headers: { host: 'evil.example.com' } }, (res) => resolve(res.statusCode));
    req.end();
  });
  assert.equal(status, 403);
});

test('GET /api/download/:id serves the last conversion as a .md attachment', async (t) => {
  const s = await testServer(t);
  const { body, contentType } = multipartBody('report.pdf', samplePdf());
  const j = await (await s.write('/api/convert', body, { 'content-type': contentType })).json();
  const r = await s.get(`/api/download/${j.id}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/markdown/);
  assert.match(r.headers.get('content-disposition'), /report\.md/);
  assert.equal(await r.text(), j.markdown);
});

test('GET /api/download/:id: unknown id is 404, wrong Accept is 406', async (t) => {
  const s = await testServer(t);
  let r = await s.get('/api/download/nope');
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'not_found');
  const { body, contentType } = multipartBody('report.pdf', samplePdf());
  const j = await (await s.write('/api/convert', body, { 'content-type': contentType })).json();
  r = await s.get(`/api/download/${j.id}`, { accept: 'application/xml' });
  assert.equal(r.status, 406);
});
