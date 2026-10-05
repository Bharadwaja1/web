const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['backend', 'frontend', 'scripts', 'selenium-tests', 'appium-tests', 'load-tests', 'security-tests', 'test-support'];
const files = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(item);
    else if (/\.(?:c?js|mjs)$/.test(entry.name)) files.push(item);
  }
}
roots.forEach(walk);
const mode = process.argv[2];
const failures = [];
if (mode === 'lint') {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(`${file}: ${result.stderr || result.stdout}`);
  }
} else if (mode === 'format') {
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (/\r(?!\n)/.test(source)) failures.push(`${file}: contains bare carriage returns`);
    if (source.length && !source.endsWith('\n')) failures.push(`${file}: must end with a newline`);
    source.split(/\r?\n/).forEach((line, index) => {
      if (/[ \t]+$/.test(line)) failures.push(`${file}:${index + 1}: trailing whitespace`);
    });
  }
} else failures.push('Usage: quality-check.cjs lint|format');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`${mode}: ${files.length} JavaScript files passed.`);
