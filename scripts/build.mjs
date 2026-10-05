import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../frontend/', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });
console.log('Mood Tunes static build ready in dist.');
