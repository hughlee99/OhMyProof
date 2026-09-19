function metric(world, simulation, name) {
  return world?.simulations?.[simulation]?.metrics?.[name]?.median ?? null;
}

function compare(rule, comparison) {
  const baseline = metric(comparison.baseline, rule.simulation, rule.metric);
  const candidate = metric(comparison.candidate, rule.simulation, rule.metric);
  if (!Number.isFinite(baseline) || !Number.isFinite(candidate)) {
    return { ...rule, baseline, candidate, status: 'UNKNOWN', improvementPct: null };
  }

  const denom = Math.max(Math.abs(baseline), 1e-9);
  let improvementPct = 0;
  if (rule.direction === 'lower' || rule.direction === 'not_higher') {
    improvementPct = ((baseline - candidate) / denom) * 100;
  } else if (rule.direction === 'higher' || rule.direction === 'not_lower') {
    improvementPct = ((candidate - baseline) / denom) * 100;
  } else {
    improvementPct = -Math.abs(((candidate - baseline) / denom) * 100);
  }

  const min = rule.minImprovementPct ?? 0;
  const tolerance = rule.maxRegressionPct ?? rule.tolerancePct ?? 0;
  let status = 'UNKNOWN';

  if (rule.direction === 'equal') {
    status = Math.abs(improvementPct) <= tolerance ? 'SUPPORTED' : 'CONTRADICTED';
  } else if (rule.direction === 'not_lower' || rule.direction === 'not_higher') {
    status = improvementPct >= -tolerance ? 'SUPPORTED' : 'CONTRADICTED';
  } else if (improvementPct >= min) {
    status = 'SUPPORTED';
  } else if (improvementPct < -tolerance) {
    status = 'CONTRADICTED';
  }

  return { ...rule, baseline, candidate, improvementPct, status };
}

export function buildEvidence(plan, comparison, warnings = []) {
  const claims = (plan.claims ?? []).map((claim) => {
    const evidence = (claim.evidence ?? []).map((rule) => compare(rule, comparison));
    let status = 'UNKNOWN';
    if (evidence.some((x) => x.status === 'CONTRADICTED')) status = 'CONTRADICTED';
    else if (evidence.length && evidence.every((x) => x.status === 'SUPPORTED')) status = 'SUPPORTED';
    return { id: claim.id, statement: claim.statement, status, evidence };
  });

  const guardrailChecks = (plan.guardrails ?? []).map((guard) =>
    compare({ ...guard, maxRegressionPct: guard.tolerancePct ?? 0 }, comparison)
  );
  const regressions = guardrailChecks
    .filter((x) => x.status === 'CONTRADICTED')
    .map((x) => ({ ...x, label: x.label ?? x.simulation + ':' + x.metric }));

  return {
    claims,
    guardrailChecks,
    regressions,
    unknowns: plan.unknowns ?? [],
    warnings,
    summary: {
      supported: claims.filter((x) => x.status === 'SUPPORTED').length,
      contradicted: claims.filter((x) => x.status === 'CONTRADICTED').length,
      unknown: claims.filter((x) => x.status === 'UNKNOWN').length,
      regressions: regressions.length,
    },
  };
}
