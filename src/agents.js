import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { commandExists } from './process.js';
import { fingerprintWorkspace, assertWorkspaceUnchanged } from './workspace-guard.js';

export async function detectAgent(preferred = 'auto') {
  if (preferred !== 'auto') {
    if (!(await commandExists(preferred))) throw new Error(preferred + ' CLI was not found');
    return preferred;
  }
  if (await commandExists('codex')) return 'codex';
  if (await commandExists('claude')) return 'claude';
  throw new Error('No supported coding agent found. Install Codex/Claude or pass --plan and --patch.');
}

function spawnAgent(agent, cwd, prompt) {
  const spec = agent === 'codex'
    ? {
        command: 'codex',
        args: ['-C', cwd, '-s', 'workspace-write', '-a', 'never', 'exec', prompt],
      }
    : {
        command: 'claude',
        args: ['--print', '--allowedTools', 'Read,Glob,Grep,Bash,Edit,Write', prompt],
      };

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => resolve({ exitCode: null, stdout, stderr, error: error.message }));
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr, error: null }));
  });
}

export async function planExperiment(agent, cwd, proposal) {
  const prompt = [
    'You are the experiment designer for OhMyProof, an evidence-driven coding harness.',
    'Do NOT implement the proposal.',
    'Your job is to try to falsify it using this repository.',
    '',
    'Proposal:',
    proposal,
    '',
    'Inspect the repository and create ONLY a OhMyProof experiment bundle under .ohmyproof/.',
    'Required file: .ohmyproof/experiment.json',
    'Optional helper scripts: .ohmyproof/sim/*',
    '',
    'Rules:',
    '- Prefer deterministic executable evidence over prose or LLM judgment.',
    '- Include existing regression tests when available.',
    '- Include a targeted simulation for each important claimed benefit.',
    '- Include at least one edge/adversarial/stress/failure scenario when feasible.',
    '- Record untestable assumptions in unknowns.',
    '- Commands must be argv arrays. Allowed executable names in v0.1: node, npm, npx, pnpm, yarn, python, python3, pytest, git, go, cargo, deno, bun.',
    '- Helper scripts should print numeric observations as: OHMYPROOF_METRIC metric_name=number',
    '- Do not modify product source code.',
    '- Do not commit, push, or change files outside .ohmyproof/.',
    '',
    'Schema:',
    JSON.stringify({
      version: 1,
      proposal: 'string',
      claims: [{
        id: 'C1',
        statement: 'string',
        evidence: [{
          simulation: 'simulation-id',
          metric: 'metric_name',
          direction: 'lower|higher|not_lower|not_higher|equal',
          minImprovementPct: 0,
          maxRegressionPct: 5
        }]
      }],
      setup: [{ argv: ['npm', 'ci'], timeoutMs: 120000 }],
      simulations: [{
        id: 'unique-id',
        title: 'string',
        category: 'regression|performance|load|edge|fault|behavior',
        argv: ['node', '.ohmyproof/sim/example.mjs'],
        repeats: 3,
        timeoutMs: 30000,
        expectExitCode: 0
      }],
      guardrails: [{
        simulation: 'simulation-id',
        metric: 'success_rate',
        direction: 'not_lower',
        tolerancePct: 0,
        label: 'string'
      }],
      unknowns: ['string']
    }, null, 2),
    '',
    'When done, briefly state what files you created.',
  ].join('\n');

  const workspaceBefore = await fingerprintWorkspace(cwd, ['.ohmyproof/']);
  const result = await spawnAgent(agent, cwd, prompt);
  await assertWorkspaceUnchanged(workspaceBefore, cwd, ['.ohmyproof/']);
  if (result.exitCode !== 0) throw new Error('Planner agent failed\n' + result.stderr + '\n' + result.stdout);

  const planPath = path.join(cwd, '.ohmyproof', 'experiment.json');
  await fs.access(planPath);
  return { ...result, planPath };
}

export async function implementCandidate(agent, cwd, proposal) {
  const prompt = [
    'You are implementing ONE candidate for a OhMyProof experiment.',
    '',
    'Proposal:',
    proposal,
    '',
    'Implement the proposal in this isolated Git worktree.',
    'Preserve existing behavior unless the proposal explicitly changes it.',
    'Do not weaken or rewrite tests merely to make the proposal pass.',
    'Do not commit or push.',
    'Do not write outside this worktree.',
    'Run reasonable local checks after implementation.',
    'This implementation will be compared against an untouched baseline using an experiment designed independently before your implementation.',
  ].join('\n');

  const result = await spawnAgent(agent, cwd, prompt);
  if (result.exitCode !== 0) throw new Error('Candidate agent failed\n' + result.stderr + '\n' + result.stdout);
  return result;
}
