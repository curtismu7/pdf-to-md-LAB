// Regenerates the bundled sample.pdf. Run: node server/assets/sample.mjs
import { writeSample } from './generator.mjs';
writeSample(new URL('.', import.meta.url));
console.log('wrote sample.pdf');
