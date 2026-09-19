import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

const skipDirs = new Set(['.git', 'node_modules', '.ohmyproof']);
const textExtensions = new Set(['.js', '.mjs', '.json', '.md', '.yml', '.yaml', '.txt', '']);

const secretPatterns = [
  { name: 'OpenAI-style API key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'GitHub classic token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }

    const ext = path.extname(entry.name);
    if (!textExtensions.has(ext) && entry.name !== 'LICENSE' && entry.name !== '.gitignore') continue;

    let text;
    try {
      text = await fs.readFile(full, 'utf8');
    } catch {
      continue;
    }

    if (rel(full) !== 'scripts/public-check.mjs' && /VibeProof|vibeproof|VIBEPROOF/.test(text)) {
      failures.push(rel(full) + ': old project name remains');
    }

    if (/C:\\Users\\[A-Za-z0-9._-]+|\/mnt\/c\/Users\/[A-Za-z0-9._-]+/.test(text)) {
      failures.push(rel(full) + ': local user path detected');
    }

    for (const pattern of secretPatterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(text)) failures.push(rel(full) + ': possible ' + pattern.name);
    }
  }
}

await walk(root);

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (packageJson.name !== 'ohmyproof') failures.push('package.json: package name must be ohmyproof');
if (packageJson.bin?.ohmyproof !== './bin/ohmyproof.js') failures.push('package.json: ohmyproof bin mapping is invalid');
if (packageJson.private === true) failures.push('package.json: package is marked private');
if (!packageJson.license) failures.push('package.json: license is missing');
if (!packageJson.engines?.node) warnings.push('package.json: node engine is not declared');

try {
  await fs.access(path.join(root, '.ohmyproof'));
  warnings.push('.ohmyproof exists locally; ensure generated reports remain ignored');
} catch {}

for (const required of ['README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', '.github/workflows/ci.yml']) {
  try {
    await fs.access(path.join(root, required));
  } catch {
    failures.push('missing required public file: ' + required);
  }
}

if (warnings.length) {
  console.log('Warnings:');
  for (const warning of warnings) console.log('  - ' + warning);
  console.log('');
}

if (failures.length) {
  console.error('Public readiness check failed:');
  for (const failure of failures) console.error('  - ' + failure);
  process.exitCode = 1;
} else {
  console.log('Public readiness check passed.');
}
