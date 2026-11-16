// One Express file: convert (multipart PDF -> markdown), download of the last
// conversion, and the built web page. Loopback Host check on everything.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { convertPdf, ConvertError, LIMITS } from './convert.js';

const pkg = () => JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = process.env.WEB_DIST || path.resolve(HERE, '../../web/dist');

// DNS-rebinding defence: the Host header must name the loopback interface,
// or one of the lab-proxy names in LAB_ALLOWED_HOSTS (comma-separated host names).
const ALLOWED_HOSTS = new Set(String(process.env.LAB_ALLOWED_HOSTS || '')
  .split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));

export function isLoopbackHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(h);
}

function hostCheck(req, res, next) {
  const raw = String(req.headers.host || '');
  const host = (raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.replace(/:\d+$/, '')).toLowerCase();
  if (!isLoopbackHost(host) && !ALLOWED_HOSTS.has(host)) {
    return res.status(403).json({ error: 'bad_host', message: 'Host must be loopback' });
  }
  next();
}

// Multipart parsing without busboy: one field named "file", bounded by LIMITS.maxBytes.
export function readMultipartFile(req) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '');
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
    if (!m) return reject(new ConvertError('bad_request', 'expected multipart/form-data with a boundary'));
    const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > LIMITS.maxBytes + 64 * 1024) { done = true; resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      const body = Buffer.concat(chunks);
      const idx = body.indexOf(boundary);
      if (idx < 0) return reject(new ConvertError('bad_request', 'multipart boundary not found'));
      const headEnd = body.indexOf('\r\n\r\n', idx);
      if (headEnd < 0) return reject(new ConvertError('bad_request', 'multipart part header not found'));
      const headers = body.subarray(idx, headEnd).toString('utf8');
      const name = /name="([^"]*)"/.exec(headers)?.[1] || '';
      const part = /filename="([^"]*)"/.exec(headers)?.[1] || 'upload.pdf';
      if (name !== 'file') return reject(new ConvertError('bad_request', 'expected one field named "file"'));
      const next = body.indexOf(boundary, headEnd);
      if (next < 0) return reject(new ConvertError('bad_request', 'multipart part not terminated'));
      resolve({ filename: part, data: body.subarray(headEnd + 4, next - 2) });
    });
    req.on('error', reject);
  });
}

export function createApp() {
  let last = null;
  const app = express();
  app.disable('x-powered-by');
  app.use(hostCheck);
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });

  app.post('/api/convert', async (req, res) => {
    try {
      const ct = String(req.headers['content-type'] || '');
      if (!ct.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'bad_request', message: 'send the PDF as multipart/form-data, one field named "file"' });
      }
      const declared = Number(req.headers['content-length'] || 0);
      if (declared > LIMITS.maxBytes) return res.status(413).json({ error: 'file_too_large', message: `file exceeds ${LIMITS.maxBytes} bytes` });
      const file = await readMultipartFile(req);
      if (!file) return res.status(413).json({ error: 'file_too_large', message: `file exceeds ${LIMITS.maxBytes} bytes` });
      if (!/\.pdf$/i.test(file.filename)) return res.status(415).json({ error: 'bad_file_type', message: 'only .pdf files are accepted' });
      const r = await convertPdf(file.data, { filename: file.filename });
      last = { id: `r-${Date.now()}`, filename: file.filename, markdown: r.markdown, stats: r.stats };
      return res.json(last);
    } catch (e) {
      if (e instanceof ConvertError) {
        const status = { file_too_large: 413, not_a_pdf: 415, bad_file_type: 415, empty_file: 400, bad_request: 400 }[e.code] || 422;
        return res.status(status).json({ error: e.code, message: e.message });
      }
      return res.status(500).json({ error: 'conversion_failed', message: String(e?.message || e).slice(0, 200) });
    }
  });

  // GET /api/health, contract demo-health/1 (the demo shelf's docs/health-contract.md).
  app.get('/api/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      schema: 'demo-health/1',
      at: new Date().toISOString(),
      state: 'ready',
      runtime: 'offline',
      demo: { id: 'pdf-to-md-lab', name: 'PDF to Markdown LAB', version: pkg().version },
    });
  });

  app.get('/api/download/:id', (req, res) => {    if (!last || last.id !== req.params.id) {
      return res.status(404).json({ error: 'not_found', message: 'no such conversion (only the last one is kept)' });
    }
    const accept = req.headers.accept || '*/*';
    if (!accept.split(',').some((a) => { const t = a.trim().split(';')[0]; return t === '*/*' || t === 'text/*' || t === 'text/markdown'; })) {
      return res.status(406).json({ error: 'not_acceptable', message: 'this endpoint serves text/markdown' });
    }
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${last.filename.replace(/\.pdf$/i, '')}.md"`);
    return res.send(last.markdown);
  });

  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { index: 'index.html', maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  } else {
    app.use((_req, res) => res.status(404).json({ error: 'not_found', message: 'unknown route (the web page is not built into web/dist)' }));
  }

  return app;
}
