import fs from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from './process.js';

async function git(cwd, args) {
  const result = await runProcess(['git', ...args], { cwd, timeoutMs: 120000 });
  if (result.exitCode !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed\n' + result.stderr);
  }
  return result;
}

export async function getRepoRoot(repo) {
  const result = await git(repo, ['rev-parse', '--show-toplevel']);
  return result.stdout.trim();
}

export async function createWorlds(repo, runRoot, includePlanner = true) {
  const root = await getRepoRoot(repo);
  const worlds = {
    baseline: path.join(runRoot, 'baseline'),
    candidate: path.join(runRoot, 'candidate'),
  };
  if (includePlanner) worlds.planner = path.join(runRoot, 'planner');

  await fs.mkdir(runRoot, { recursive: true });

  for (const worldPath of Object.values(worlds)) {
    await git(root, ['worktree', 'add', '--detach', worldPath, 'HEAD']);
  }

  const diff = await git(root, ['diff', '--binary', 'HEAD']);
  if (diff.stdout.trim()) {
    for (const worldPath of Object.values(worlds)) {
      const patchPath = path.join(runRoot, 'working-tree.patch');
      await fs.writeFile(patchPath, diff.stdout, 'utf8');
      await git(worldPath, ['apply', '--whitespace=nowarn', patchPath]);
    }
  }

  const untracked = await git(root, ['ls-files', '--others', '--exclude-standard']);
  const files = untracked.stdout.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  for (const relative of files) {
    const source = path.join(root, relative);
    for (const worldPath of Object.values(worlds)) {
      const destination = path.join(worldPath, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.cp(source, destination, { recursive: true });
    }
  }

  return { root, worlds };
}

export async function cleanupWorlds(repoRoot, worlds) {
  for (const worldPath of Object.values(worlds)) {
    try {
      await git(repoRoot, ['worktree', 'remove', '--force', worldPath]);
    } catch {
      // Keep cleanup best-effort; proof artifacts are already persisted elsewhere.
    }
  }
  try { await git(repoRoot, ['worktree', 'prune']); } catch {}
}

export async function candidateDiff(candidatePath) {
  await git(candidatePath, ['add', '-N', '--', '.']);
  try {
    const result = await git(candidatePath, ['diff', '--binary', 'HEAD']);
    return result.stdout;
  } finally {
    await git(candidatePath, ['reset', '--mixed', 'HEAD']);
  }
}

export async function applyPatch(candidatePath, patchPath) {
  await git(candidatePath, ['apply', '--whitespace=nowarn', patchPath]);
}
