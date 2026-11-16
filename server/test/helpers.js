import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

export async function testServer(t) {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  t.after(() => new Promise((r) => server.close(r)));
  return {
    base,
    get: (p, headers = {}) => fetch(base + p, { headers }),
    write: (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers, body }),
  };
}

export function multipartBody(filename, data) {
  const b = `----pdfmd${Date.now()}`;
  const head = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${b}--\r\n`);
  return { body: Buffer.concat([head, data, tail]), contentType: `multipart/form-data; boundary=${b}` };
}

export const samplePdf = () => readFileSync(new URL('../assets/sample.pdf', import.meta.url));
