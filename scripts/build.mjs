import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../frontend/', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });
console.log('Sonora static build ready in dist.');
