function fmt(value, digits = 4) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(digits);
}

function paramsLabel(params = {}) {
  const entries = Object.entries(params);
  return entries.length ? entries.map(([key, value]) => key + '=' + value).join(', ') : 'default';
}

function metricOrder(campaign) {
  return (campaign.metrics ?? []).map((metric) => metric.name);
}

function getStat(summary, metric, stat = 'mean') {
  return summary.metrics?.[metric]?.[stat] ?? null;
}

function metricDefinition(campaign, name) {
  return (campaign.metrics ?? []).find((metric) => metric.name === name) ?? {};
}

export function renderCampaignReport({ runId, campaign, summaries, selection, failures, warnings }) {
  const lines = [];
  lines.push('# OhMyProof Campaign Report', '');
  lines.push('**Run:** ' + runId, '');
  lines.push('**Question:** ' + campaign.question, '');
  lines.push('> This campaign compares executable alternatives across multiple worlds. It reports evidence, not a universal architecture verdict.', '');

  lines.push('## What was actually run', '');
  lines.push('- Candidates: **' + campaign.candidates.length + '**');
  lines.push('- Worlds: **' + campaign.worlds.length + '**');
  const sweepCount = Object.values(campaign.sweep ?? {}).reduce((total, values) => total * values.length, 1);
  lines.push('- Parameter combinations per candidate: **' + sweepCount + '**');
  lines.push('- Simulations per cell: **' + campaign.simulations.length + '**', '');

  const splits = [...new Set(summaries.map((summary) => summary.split))];
  const metrics = metricOrder(campaign);
  for (const split of splits) {
    const rows = summaries.filter((summary) => summary.split === split);
    lines.push('## ' + split[0].toUpperCase() + split.slice(1) + ' results', '');
    const header = ['Candidate', 'Parameters', 'Worlds', ...metrics, 'Failures'];
    lines.push('| ' + header.join(' | ') + ' |');
    lines.push('| ' + header.map((_, index) => index < 2 ? '---' : '---:').join(' | ') + ' |');
    for (const row of rows) {
      const values = [row.candidateLabel, paramsLabel(row.params), row.worldCount,
        ...metrics.map((metric) => fmt(row.metrics?.[metric]?.mean)), row.failureCount];
      lines.push('| ' + values.join(' | ') + ' |');
    }
    lines.push('');
  }

  if (selection) {
    const chosen = selection.selected;
    lines.push('## Calibrated configuration', '');
    lines.push('The declared calibration constraints and objective selected:', '');
    lines.push('- Candidate: **' + chosen.candidateLabel + '**');
    lines.push('- Parameters: **' + paramsLabel(chosen.params) + '**');
    lines.push('- Eligible configurations after constraints: **' + selection.eligibleCount + '**', '');
    lines.push('| Metric | Calibration mean | Calibration worst | Held-out mean | Held-out worst |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const metric of metrics) {
      const definition = metricDefinition(campaign, metric);
      const worstKey = definition.direction === 'lower' ? 'max' : 'min';
      lines.push('| ' + metric + ' | ' + fmt(chosen.metrics?.[metric]?.mean) + ' | ' +
        fmt(chosen.metrics?.[metric]?.[worstKey]) + ' | ' + fmt(selection.heldout?.metrics?.[metric]?.mean) +
        ' | ' + fmt(selection.heldout?.metrics?.[metric]?.[worstKey]) + ' |');
    }
    lines.push('');
    if (!selection.heldout) {
      lines.push('**Held-out validation is unavailable.**', '');
    } else {
      lines.push('Held-out constraint check: **' + (selection.heldoutPassed ? 'PASSED' : 'FAILED') + '**', '');
    }
  } else if (campaign.selection) {
    lines.push('## Calibration', '', 'No configuration satisfied all declared calibration constraints.', '');
  }

  lines.push('## Failure mining', '');
  if (!failures.length) {
    lines.push('_No structured failure events were emitted._', '');
  } else {
    lines.push('| Configuration | Split | Failure cluster | Count |');
    lines.push('| --- | --- | --- | ---: |');
    for (const cluster of failures.slice(0, 30)) {
      lines.push('| ' + cluster.configKey + ' | ' + cluster.split + ' | ' + cluster.type + ' | ' + cluster.count + ' |');
    }
    lines.push('');
  }

  if ((campaign.unknowns ?? []).length) {
    lines.push('## Unknowns', '');
    for (const unknown of campaign.unknowns) lines.push('- ' + unknown);
    lines.push('');
  }

  if (warnings.length) {
    lines.push('## Campaign warnings', '');
    for (const warning of warnings) lines.push('- ' + warning);
    lines.push('');
  }

  lines.push('## Next falsification', '');
  if (selection?.heldout && selection.heldoutPassed) {
    lines.push('The selected configuration satisfied the declared constraints on held-out worlds. Next, test it against a more realistic or production-derived world rather than increasing confidence from the same generator.');
  } else if (selection?.heldout && selection.heldoutPassed === false) {
    lines.push('The calibration-selected configuration failed at least one held-out constraint. Treat this as evidence of overfitting or insufficient robustness and revise the candidate, parameter rule, or world generator before production testing.');
  } else if (selection) {
    lines.push('Create unseen held-out worlds before treating the calibration result as robust.');
  } else {
    lines.push('Inspect failure clusters, revise the hypothesis or candidate set, and run another campaign rather than forcing a conclusion.');
  }
  lines.push('', '**AI suggestions are hypotheses, not answers.**', '');
  return lines.join('\n');
}
