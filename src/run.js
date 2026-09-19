import { prepareProof } from './proof.js';
import { prepareCandidate } from './candidate.js';
import { installBundle } from './bundle.js';
import { runComparison } from './simulator.js';
import { buildResult } from './result.js';
import { persistProof } from './persist.js';
import { cleanupWorlds } from './git.js';
import { loadPlan, experimentWarnings } from './plan.js';
import { buildEvidence } from './evidence.js';
import { renderMarkdown } from './report.js';
import path from 'node:path';

export async function prove(options) {
  const state = await prepareProof(options);
  try {
    const candidate = await prepareCandidate(state, options);
    await installBundle(state);
    const comparison = await runComparison(
      state.plan,
      state.worlds.baseline,
      state.worlds.candidate
    );
    const result = buildResult(state, candidate, comparison);
    await persistProof(state, candidate, result);
    return { ...result, runId: state.runId, reportDir: state.reportDir };
  } finally {
    if (!options.keep) await cleanupWorlds(state.root, state.worlds);
  }
}

export async function verifyExisting(options) {
  const plan = await loadPlan(path.resolve(options.plan));
  const comparison = await runComparison(
    plan,
    path.resolve(options.baseline),
    path.resolve(options.candidate)
  );
  const evidence = buildEvidence(plan, comparison, experimentWarnings(plan));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const report = renderMarkdown({
    runId,
    proposal: plan.proposal ?? 'Existing baseline/candidate comparison',
    plan,
    comparison,
    evidence,
    agent: 'manual',
  });
  return { runId, report, proof: { plan, comparison, evidence } };
}
