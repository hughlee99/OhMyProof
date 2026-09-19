import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorlds, cleanupWorlds, candidateDiff, applyPatch, getRepoRoot } from './git.js';
import { detectAgent, planExperiment, implementCandidate } from './agents.js';
import { loadPlan, copyExperimentBundle, experimentWarnings } from './plan.js';
import { runComparison } from './simulator.js';
import { buildEvidence } from './evidence.js';
import { renderMarkdown } from './report.js';

function makeRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function copyExternalBundle(planPath, worlds) {
  const absolute = path.resolve(planPath);
  const sourceDir = path.dirname(absolute);
  const content = await fs.readFile(absolute, 'utf8');
  for (const world of worlds) {
    const target = path.join(world, '.ohmyproof');
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'experiment.json'), content, 'utf8');
    const sim = path.join(sourceDir, 'sim');
    try {
      await fs.access(sim);
      await fs.cp(sim, path.join(target, 'sim'), { recursive: true });
    } catch {}
  }
}

export async function prepareProof(options) {
  const repoRoot = await getRepoRoot(path.resolve(options.repo ?? process.cwd()));
  if (!options.proposal) throw new Error('A proposal is required');

  const runId = makeRunId();
  const reportDir = path.join(repoRoot, '.ohmyproof', 'reports', runId);
  const runRoot = path.join(os.tmpdir(), 'ohmyproof', runId);
  await fs.mkdir(reportDir, { recursive: true });

  const needsPlanner = !options.plan;
  const created = await createWorlds(repoRoot, runRoot, needsPlanner);
  let agent = options.agent ?? 'auto';
  let plannerLog = '';

  let planPath;
  let plan;
  if (options.plan) {
    planPath = path.resolve(options.plan);
    plan = await loadPlan(planPath);
  } else {
    agent = await detectAgent(agent);
    const planned = await planExperiment(agent, created.worlds.planner, options.proposal);
    plannerLog = [planned.stdout, planned.stderr].filter(Boolean).join('\n');
    planPath = planned.planPath;
    plan = await loadPlan(planPath);
  }

  return {
    ...created,
    runId,
    runRoot,
    reportDir,
    proposal: options.proposal,
    needsPlanner,
    planPath,
    plan,
    agent,
    plannerLog,
  };
}
