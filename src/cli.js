import { commandExists } from './process.js';
import { prove, verifyExisting } from './run.js';
import { runCampaignFile } from './campaign-run.js';
import { investigate } from './investigate.js';

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positional };
}

function help() {
  return [
    'OhMyProof v0.2 — Evidence-driven Vibe Coding',
    '',
    'Usage:',
    '  ohmyproof doctor',
    '  ohmyproof prove "<proposal>" --repo <path> [--agent auto|codex|claude] [--plan <experiment.json>] [--patch <candidate.patch>] [--keep]',
    '  ohmyproof verify --baseline <path> --candidate <path> --plan <experiment.json>',
    '  ohmyproof campaign --campaign <campaign.json> [--repo <path>]',
    '  ohmyproof investigate "<question>" --repo <path> [--agent auto|codex|claude] [--keep]',
    '',
    'Principle:',
    '  AI suggestions are hypotheses, not answers.',
    '  OhMyProof turns claims into executable experiments and reports evidence.',
  ].join('\n');
}

async function doctor() {
  const checks = {};
  for (const command of ['node', 'npm', 'git', 'codex', 'claude']) {
    checks[command] = await commandExists(command);
  }
  console.log('OhMyProof doctor\n');
  for (const [name, ok] of Object.entries(checks)) {
    console.log((ok ? '✓' : '·') + ' ' + name + (ok ? ' available' : ' not found'));
  }
  console.log('\nRequired: node + git. Agent automation: codex or claude.');
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? 'help';
  const { flags, positional } = parseArgs(argv.slice(1));

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(help());
    return;
  }

  if (command === 'doctor') {
    await doctor();
    return;
  }

  if (command === 'prove') {
    const proposal = positional.join(' ').trim();
    if (!proposal) throw new Error('prove requires a proposal');
    const result = await prove({
      proposal,
      repo: flags.repo ?? process.cwd(),
      agent: flags.agent ?? 'auto',
      plan: flags.plan || null,
      patch: flags.patch || null,
      keep: Boolean(flags.keep),
    });
    console.log(result.report);
    console.log('\nArtifacts: ' + result.reportDir);
    return;
  }

  if (command === 'verify') {
    if (!flags.baseline || !flags.candidate || !flags.plan) {
      throw new Error('verify requires --baseline, --candidate, and --plan');
    }
    const result = await verifyExisting({
      baseline: flags.baseline,
      candidate: flags.candidate,
      plan: flags.plan,
    });
    console.log(result.report);
    return;
  }

  if (command === 'campaign') {
    if (!flags.campaign) throw new Error('campaign requires --campaign <campaign.json>');
    const result = await runCampaignFile({
      campaign: flags.campaign,
      repo: flags.repo ?? process.cwd(),
    });
    console.log(result.report);
    console.log('\nArtifacts: ' + result.reportDir);
    return;
  }

  if (command === 'investigate') {
    const question = positional.join(' ').trim();
    if (!question) throw new Error('investigate requires a question');
    const result = await investigate({
      question,
      repo: flags.repo ?? process.cwd(),
      agent: flags.agent ?? 'auto',
      keep: Boolean(flags.keep),
    });
    console.log(result.report);
    console.log('\nPlanner: ' + result.agent);
    console.log('Artifacts: ' + result.reportDir);
    return;
  }

  throw new Error('Unknown command: ' + command + '\n\n' + help());
}
