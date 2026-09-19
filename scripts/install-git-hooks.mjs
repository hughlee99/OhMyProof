import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const hooksDir = path.join(root, '.githooks');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function resolveHookPath(value) {
  if (!value) return '';
  if (value === '.githooks') return hooksDir;
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

const gitDirValue = git(['rev-parse', '--git-common-dir']);
const gitDir = path.resolve(root, gitDirValue);
const workcycleSetupPath = path.join(gitDir, 'workcycle', 'setup.json');

let currentHooksPath = '';
try {
  currentHooksPath = git(['config', '--get', 'core.hooksPath']);
} catch {}

if (fs.existsSync(workcycleSetupPath) && /workcycle[\\/]hooks$/i.test(currentHooksPath)) {
  const setup = JSON.parse(fs.readFileSync(workcycleSetupPath, 'utf8'));
  const previous = setup.previousHooks;
  const previousResolved = resolveHookPath(previous);
  const previousExists = previousResolved && fs.existsSync(previousResolved);
  const alreadyOurs = previousResolved && path.resolve(previousResolved) === path.resolve(hooksDir);

  if (previous && previousExists && !alreadyOurs) {
    throw new Error(`Refusing to replace existing Workcycle hook chain: ${previous}`);
  }

  git(['config', 'core.hooksPath', '.git/workcycle/hooks']);
  setup.previousHooks = '.githooks';
  fs.writeFileSync(workcycleSetupPath, `${JSON.stringify(setup, null, 2)}\n`);
  console.log('OhMyProof safety hooks chained after Workcycle.');
} else if (!currentHooksPath || path.resolve(resolveHookPath(currentHooksPath)) === path.resolve(hooksDir)) {
  git(['config', 'core.hooksPath', '.githooks']);
  console.log('OhMyProof safety hooks enabled.');
} else {
  throw new Error(`Existing core.hooksPath is managed elsewhere: ${currentHooksPath}`);
}
