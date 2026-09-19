import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runProcess } from './process.js';

function normalize(relative) {
  return relative.split(path.sep).join('/');
}

function isAllowed(relative, allowedPrefixes) {
  const value = normalize(relative);
  return allowedPrefixes.some((prefix) => {
    const normalized = prefix.replace(/\\/g, '/').replace(/^\.\//, '');
    return value === normalized.replace(/\/$/, '') || value.startsWith(normalized.endsWith('/') ? normalized : normalized + '/');
  });
}

async function hashFile(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function fingerprintWorkspace(cwd, allowedPrefixes = ['.ohmyproof/']) {
  const listed = await runProcess(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd, timeoutMs: 120000 }
  );
  if (listed.exitCode !== 0) throw new Error('Unable to inspect workspace for planner guard');

  const files = listed.stdout.split('\0').filter(Boolean).sort();
  const aggregate = createHash('sha256');

  for (const relative of files) {
    if (isAllowed(relative, allowedPrefixes)) continue;
    const absolute = path.join(cwd, relative);
    let stat;
    try {
      stat = await fs.lstat(absolute);
    } catch {
      aggregate.update(relative + ':missing\n');
      continue;
    }

    aggregate.update(normalize(relative) + ':');
    if (stat.isSymbolicLink()) {
      aggregate.update('symlink:' + await fs.readlink(absolute));
    } else if (stat.isFile()) {
      aggregate.update('file:' + await hashFile(absolute));
    } else {
      aggregate.update('other:' + stat.mode + ':' + stat.size);
    }
    aggregate.update('\n');
  }

  return aggregate.digest('hex');
}

export async function assertWorkspaceUnchanged(before, cwd, allowedPrefixes = ['.ohmyproof/']) {
  const after = await fingerprintWorkspace(cwd, allowedPrefixes);
  if (before !== after) {
    throw new Error(
      'Planner modified repository files outside the allowed OhMyProof experiment directory. ' +
      'The generated experiment was rejected.'
    );
  }
}
