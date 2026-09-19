function fmt(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(2);
}

function pct(value) {
  return Number.isFinite(value) ? value.toFixed(1) + '%' : '—';
}

export function renderMarkdown({ runId, proposal, plan, comparison, evidence, agent }) {
  const lines = [];
  lines.push('# OhMyProof Evidence Report');
  lines.push('');
  lines.push('**Run:** ' + runId);
  lines.push('');
  lines.push('**Proposal:** ' + proposal);
  lines.push('');
  lines.push('**Agent:** ' + (agent ?? 'manual'));
  lines.push('');
  lines.push('> This report presents observed evidence. It does not make the product decision for you.');
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Supported | Contradicted | Unknown | Regressions |');
  lines.push('| ---: | ---: | ---: | ---: |');
  lines.push('| ' + evidence.summary.supported + ' | ' + evidence.summary.contradicted + ' | ' + evidence.summary.unknown + ' | ' + evidence.summary.regressions + ' |');
  lines.push('');

  lines.push('## Claims');
  lines.push('');
  if (!evidence.claims.length) {
    lines.push('_No explicit claims were defined._');
  } else {
    lines.push('| Claim | Status |');
    lines.push('| --- | --- |');
    for (const claim of evidence.claims) {
      lines.push('| ' + claim.id + ' — ' + claim.statement.replaceAll('|', '\\|') + ' | **' + claim.status + '** |');
    }
    lines.push('');
    for (const claim of evidence.claims) {
      lines.push('### ' + claim.id + ' — ' + claim.status);
      lines.push('');
      lines.push(claim.statement);
      lines.push('');
      lines.push('| Simulation | Metric | Baseline | Candidate | Improvement | Evidence |');
      lines.push('| --- | --- | ---: | ---: | ---: | --- |');
      for (const item of claim.evidence) {
        lines.push('| ' + item.simulation + ' | ' + item.metric + ' | ' + fmt(item.baseline) + ' | ' + fmt(item.candidate) + ' | ' + pct(item.improvementPct) + ' | ' + item.status + ' |');
      }
      lines.push('');
    }
  }

  lines.push('## Simulation results');
  lines.push('');
  lines.push('| Simulation | Category | Baseline pass | Candidate pass | Baseline median ms | Candidate median ms |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const sim of plan.simulations) {
    const base = comparison.baseline.simulations[sim.id];
    const cand = comparison.candidate.simulations[sim.id];
    lines.push('| ' + sim.id + ' | ' + (sim.category ?? 'behavior') + ' | ' +
      (base?.passCount ?? 0) + '/' + (base?.repeats ?? 0) + ' | ' +
      (cand?.passCount ?? 0) + '/' + (cand?.repeats ?? 0) + ' | ' +
      fmt(base?.metrics?.duration_ms?.median) + ' | ' +
      fmt(cand?.metrics?.duration_ms?.median) + ' |');
  }
  lines.push('');

  lines.push('## Regressions');
  lines.push('');
  if (!evidence.regressions.length) {
    lines.push('_No defined guardrail regression was observed._');
  } else {
    for (const item of evidence.regressions) {
      lines.push('- **' + item.label + '** — baseline ' + fmt(item.baseline) + ', candidate ' + fmt(item.candidate) + ' (' + pct(item.improvementPct) + ')');
    }
  }
  lines.push('');

  lines.push('## Unknowns');
  lines.push('');
  if (!(evidence.unknowns ?? []).length) lines.push('_None declared._');
  else for (const item of evidence.unknowns) lines.push('- ' + item);
  lines.push('');

  if ((evidence.warnings ?? []).length) {
    lines.push('## Experiment warnings');
    lines.push('');
    for (const warning of evidence.warnings) lines.push('- ' + warning);
    lines.push('');
  }

  lines.push('## Principle');
  lines.push('');
  lines.push('**AI suggestions are hypotheses, not answers.** The proposal was tested against the same executable simulations in a baseline and candidate world; the final decision remains human.');
  lines.push('');

  return lines.join('\n');
}
