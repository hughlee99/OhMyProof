import fs from 'node:fs/promises';
import path from 'node:path';
import { detectAgent } from './agents.js';
import { fingerprintWorkspace, assertWorkspaceUnchanged } from './workspace-guard.js';
import { spawn } from 'node:child_process';

function runAgent(agent, cwd, prompt, timeoutMs = 180000) {
  const spec = agent === 'codex'
    ? { command: 'codex', args: ['-C', cwd, '-s', 'workspace-write', '-a', 'never', 'exec', prompt] }
    : { command: 'claude', args: ['--print', '--allowedTools', 'Read,Glob,Grep,Bash,Edit,Write', prompt] };

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr, error: error.message, timedOut });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, error: timedOut ? 'planner timeout' : null, timedOut });
    });
  });
}

export async function designCampaign(options) {
  const agent = await detectAgent(options.agent ?? 'auto');
  const cwd = options.cwd;
  const question = options.question;
  const prompt = [
    'You are the experiment scientist for OhMyProof.',
    'Do not answer the technical question directly and do not modify product source code.',
    'Turn the question into an executable comparative experiment campaign.',
    '',
    'Question:',
    question,
    '',
    'Inspect the repository. Create only files under .ohmyproof/campaign/.',
    'Required: .ohmyproof/campaign/campaign.json',
    'Optional: .ohmyproof/campaign/sim/* helper scripts.',
    '',
    'The goal is falsification, not confirmation. Compare plausible simpler and more complex alternatives rather than testing only the proposed idea.',
    'Build multiple synthetic worlds or seeds when meaningful. Separate calibration and heldout worlds when tuning any threshold or parameter.',
    'Use parameter sweep when a meaningful cutoff, top-K, batch size, cache size, threshold, or similar parameter exists.',
    'Emit structured failure events from helper scripts when a case fails:',
    'OHMYPROOF_FAILURE {"type":"short-cluster-name","case":"human-readable-case"}',
    'Emit numeric metrics as:',
    'OHMYPROOF_METRIC metric_name=number',
    '',
    'campaign.json schema:',
    JSON.stringify({
      version: 1,
      question: 'string',
      candidates: [{ id: 'candidate-a', label: 'Candidate A', env: { METHOD: 'a' } }],
      worlds: [{ id: 'seed-1', split: 'explore|calibration|heldout', env: { SEED: '1' } }],
      sweep: { TOP_K: [5, 10, 20] },
      simulations: [{ id: 'main', title: 'Main simulation', category: 'behavior', argv: ['node', '.ohmyproof/campaign/sim/run.mjs'], repeats: 1, timeoutMs: 120000, expectExitCode: 0 }],
      metrics: [{ name: 'recall', direction: 'higher' }, { name: 'latency_ms', direction: 'lower' }],
      selection: {
        split: 'calibration',
        constraints: [{ metric: 'recall', stat: 'min', operator: '>=', value: 0.999 }],
        objective: { metric: 'context_tokens', stat: 'mean', direction: 'lower' }
      },
      failureMining: { enabled: true },
      unknowns: ['What this synthetic campaign cannot establish']
    }, null, 2),
    '',
    'Runtime protocol:',
    '- Candidate id is available as OHMYPROOF_CANDIDATE.',
    '- World id/split are OHMYPROOF_WORLD and OHMYPROOF_SPLIT.',
    '- candidate.env and world.env are injected directly.',
    '- sweep parameter KEY is available as OHMYPROOF_PARAM_KEY.',
    '- Allowed v0.2 executables: node, npm, npx, pnpm, yarn, python, python3, pytest, git, go, cargo, deno, bun.',
    '',
    'Prefer experiments that actually compute or exercise behavior. Do not fabricate benchmark numbers.',
    'If a question cannot be faithfully simulated without modifying product code or external infrastructure, scope the campaign to what is testable and record the limitation in unknowns.',
    'When finished, briefly describe the campaign files you created.'
  ].join('\n');

  const workspaceBefore = await fingerprintWorkspace(cwd, ['.ohmyproof/']);
  const result = await runAgent(agent, cwd, prompt, options.timeoutMs ?? 180000);
  await assertWorkspaceUnchanged(workspaceBefore, cwd, ['.ohmyproof/']);
  if (result.exitCode !== 0) throw new Error('Campaign planner failed\n' + result.stderr + '\n' + result.stdout);

  const campaignPath = path.join(cwd, '.ohmyproof', 'campaign', 'campaign.json');
  await fs.access(campaignPath);
  return { agent, campaignPath, stdout: result.stdout, stderr: result.stderr };
}
