import { createApp } from './app.js';

const port = Number(process.env.PORT) || 7818;
const host = process.env.HOST || '0.0.0.0';
createApp().listen(port, host, () => {
  console.log(`[pdf-to-md] listening on http://localhost:${port}/ (conversion is in-process; no network calls)`);
});
const stop = () => process.exit(0);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
