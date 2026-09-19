import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../src/process.js';
import { candidateDiff } from '../src/git.js';
import { fingerprintWorkspace, assertWorkspaceUnchanged } from '../src/workspace-guard.js';

async function git(cwd, args) {
  const result = await runProcess(['git', ...args], { cwd, timeoutMs: 30000 });
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
}

async function makeRepo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ohmyproof-public-'));
  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'ohmyproof@example.test']);
  await git(root, ['config', 'user.name', 'OhMyProof Test']);
  await fs.writeFile(path.join(root, 'tracked.txt'), 'baseline\n');
  await git(root, ['add', 'tracked.txt']);
  await git(root, ['commit', '-m', 'baseline']);
  return root;
}

test('candidate diff includes newly created untracked files', async () => {
  const repo = await makeRepo();
  try {
    await fs.writeFile(path.join(repo, 'new-file.txt'), 'new evidence\n');
    const diff = await candidateDiff(repo);
    assert.match(diff, /new-file\.txt/);
    assert.match(diff, /new evidence/);
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test('planner guard permits experiment files but detects product changes', async () => {
  const repo = await makeRepo();
  try {
    const before = await fingerprintWorkspace(repo, ['.ohmyproof/']);
    await fs.mkdir(path.join(repo, '.ohmyproof'), { recursive: true });
    await fs.writeFile(path.join(repo, '.ohmyproof', 'experiment.json'), '{}');
    await assertWorkspaceUnchanged(before, repo, ['.ohmyproof/']);

    await fs.writeFile(path.join(repo, 'tracked.txt'), 'planner changed product code\n');
    await assert.rejects(
      () => assertWorkspaceUnchanged(before, repo, ['.ohmyproof/']),
      /modified repository files/
    );
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});
