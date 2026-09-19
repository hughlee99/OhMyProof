import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const stagedOnly = process.argv.includes('--staged');
const failures = [];
const warnings = [];

const textExtensions = new Set([
  '', '.cjs', '.conf', '.css', '.env', '.html', '.ini', '.js', '.jsx', '.json', '.md', '.mjs',
  '.ps1', '.sh', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yml', '.yaml',
]);

const secretPatterns = [
  { name: 'OpenAI-style API key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'GitHub classic token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: 'Stripe live secret', regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { name: 'npm access token', regex: /\bnpm_[A-Za-z0-9]{30,}\b/g },
  { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

const forbiddenTrackedPaths = [
  { name: 'environment file', regex: /^\.env(?:\.|$)/i, allow: /^\.env\.example$/i },
  { name: 'private key/certificate credential', regex: /\.(?:pem|key|p12|pfx)$/i },
  { name: 'credential file', regex: /(?:^|\/)(?:credentials?(?:\.[^/]+)?|secrets?)\.(?:json|ya?ml|toml)$/i },
  { name: 'generated OhMyProof output', regex: /^\.ohmyproof\/(?:reports|runs)(?:\/|$)/i },
  { name: 'local-only workspace directory', regex: /^(?:private|scratch|tmp|notes|\.local)(?:\/|$)/i },
];

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
}

function normalize(file) {
  return file.split(path.sep).join('/');
}

function nulList(output) {
  return output.split('\0').filter(Boolean).map(normalize);
}

function filesToScan() {
  if (stagedOnly) {
    return nulList(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
  }
  return nulList(git(['ls-files', '-z']));
}

async function readTrackedText(file) {
  if (stagedOnly) {
    try {
      return git(['show', `:${file}`]);
    } catch {
      return null;
    }
  }

  try {
    return await fs.readFile(path.join(root, file), 'utf8');
  } catch {
    return null;
  }
}

function checkPath(file) {
  for (const rule of forbiddenTrackedPaths) {
    if (rule.allow?.test(file)) continue;
    if (rule.regex.test(file)) failures.push(`${file}: forbidden tracked ${rule.name}`);
  }
}

function checkText(file, text) {
  if (file !== 'scripts/public-check.mjs' && /VibeProof|vibeproof|VIBEPROOF/.test(text)) {
    failures.push(`${file}: old project name remains`);
  }

  if (/C:\\Users\\[A-Za-z0-9._-]+|\/mnt\/c\/Users\/[A-Za-z0-9._-]+|\/Users\/[A-Za-z0-9._-]+/.test(text)) {
    failures.push(`${file}: local user path detected`);
  }

  for (const pattern of secretPatterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) failures.push(`${file}: possible ${pattern.name}`);
  }
}

for (const file of filesToScan()) {
  checkPath(file);

  const ext = path.extname(file).toLowerCase();
  if (!textExtensions.has(ext) && path.basename(file) !== 'LICENSE' && path.basename(file) !== '.gitignore') continue;

  const text = await readTrackedText(file);
  if (text !== null) checkText(file, text);
}

if (!stagedOnly) {
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (packageJson.name !== 'ohmyproof') failures.push('package.json: package name must be ohmyproof');
  if (packageJson.bin?.ohmyproof !== './bin/ohmyproof.js') failures.push('package.json: ohmyproof bin mapping is invalid');
  if (packageJson.private === true) failures.push('package.json: package is marked private');
  if (!packageJson.license) failures.push('package.json: license is missing');
  if (!packageJson.engines?.node) warnings.push('package.json: node engine is not declared');

  try {
    await fs.access(path.join(root, '.ohmyproof'));
    warnings.push('.ohmyproof exists locally; generated reports/runs must remain ignored');
  } catch {}

  for (const required of ['README.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', '.github/workflows/ci.yml']) {
    try {
      await fs.access(path.join(root, required));
    } catch {
      failures.push(`missing required public file: ${required}`);
    }
  }
}

if (warnings.length) {
  console.log('Warnings:');
  for (const warning of warnings) console.log(`  - ${warning}`);
  console.log('');
}

if (failures.length) {
  console.error(`${stagedOnly ? 'Staged public-safety' : 'Public readiness'} check failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(stagedOnly ? 'Staged public-safety check passed.' : 'Public readiness check passed.');
}
