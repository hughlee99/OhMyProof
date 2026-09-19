import { experimentWarnings } from './plan.js';
import { buildEvidence } from './evidence.js';
import { renderMarkdown } from './report.js';

export function buildResult(state, candidate, comparison) {
  const evidence = buildEvidence(state.plan, comparison, experimentWarnings(state.plan));
  const proof = {
    version: 1,
    runId: state.runId,
    createdAt: new Date().toISOString(),
    proposal: state.proposal,
    agent: candidate.agent,
    repoRoot: state.root,
    plan: state.plan,
    comparison,
    evidence,
  };
  const report = renderMarkdown({
    runId: state.runId,
    proposal: state.proposal,
    plan: state.plan,
    comparison,
    evidence,
    agent: candidate.agent,
  });
  return { proof, report, evidence };
}
