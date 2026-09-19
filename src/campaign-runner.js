import { runProcess } from './process.js';
import { parseMetrics } from './simulator.js';
import { expandSweep, configKey } from './campaign.js';

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stats(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { mean: null, median: null, min: null, max: null, samples: [] };
  return {
    mean: mean(clean),
    median: median(clean),
    min: Math.min(...clean),
    max: Math.max(...clean),
    samples: clean,
  };
}

function safeEnvKey(key) {
  return String(key).replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
}

function buildEnv(candidate, world, params) {
  const env = {
    OHMYPROOF_CANDIDATE: candidate.id,
    OHMYPROOF_WORLD: world.id,
    OHMYPROOF_SPLIT: world.split ?? 'explore',
    ...(candidate.env ?? {}),
    ...(world.env ?? {}),
  };
  for (const [key, value] of Object.entries(params)) {
    env['OHMYPROOF_PARAM_' + safeEnvKey(key)] = String(value);
  }
  return env;
}

export function parseFailures(stdout = '', stderr = '') {
  const failures = [];
  const lines = (stdout + '\n' + stderr).split(/\r?\n/);
  for (const line of lines) {
    const marker = 'OHMYPROOF_FAILURE ';
    const index = line.indexOf(marker);
    if (index < 0) continue;
    const raw = line.slice(index + marker.length).trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') failures.push(parsed);
    } catch {
      failures.push({ type: 'unparsed', raw });
    }
  }
  return failures;
}

async function runSimulation(simulation, cwd, env) {
  const runs = [];
  const repeats = simulation.repeats ?? 1;

  for (let index = 0; index < repeats; index++) {
    const result = await runProcess(simulation.argv, {
      cwd,
      timeoutMs: simulation.timeoutMs ?? 120000,
      env: { ...env, ...(simulation.env ?? {}) },
    });

    const expected = simulation.expectExitCode ?? 0;
    runs.push({
      ...result,
      passed: result.exitCode === expected && !result.timedOut,
      metrics: parseMetrics(result.stdout, result.stderr),
      failures: parseFailures(result.stdout, result.stderr),
    });
  }

  const metricSamples = {
    duration_ms: runs.map((run) => run.durationMs),
    success_rate: runs.map((run) => run.passed ? 1 : 0),
  };

  for (const run of runs) {
    for (const [name, values] of Object.entries(run.metrics)) {
      if (!metricSamples[name]) metricSamples[name] = [];
      metricSamples[name].push(...values);
    }
  }

  const metrics = {};
  for (const [name, values] of Object.entries(metricSamples)) metrics[name] = stats(values);

  return {
    id: simulation.id,
    title: simulation.title ?? simulation.id,
    category: simulation.category ?? 'behavior',
    argv: simulation.argv,
    metrics,
    failures: runs.flatMap((run) => run.failures),
    runs,
  };
}

function flattenCellMetrics(simulations) {
  const buckets = {};
  for (const simulation of Object.values(simulations)) {
    for (const [name, valueStats] of Object.entries(simulation.metrics)) {
      if (!buckets[name]) buckets[name] = [];
      buckets[name].push(...valueStats.samples);
    }
  }
  const metrics = {};
  for (const [name, values] of Object.entries(buckets)) metrics[name] = stats(values);
  return metrics;
}

export async function runCampaignMatrix(campaign, cwd) {
  const cells = [];
  const parameterSets = expandSweep(campaign.sweep ?? {});

  for (const candidate of campaign.candidates) {
    for (const params of parameterSets) {
      for (const world of campaign.worlds) {
        const env = buildEnv(candidate, world, params);
        const simulations = {};
        for (const simulation of campaign.simulations) {
          simulations[simulation.id] = await runSimulation(simulation, cwd, env);
        }

        cells.push({
          configKey: configKey(candidate.id, params),
          candidateId: candidate.id,
          candidateLabel: candidate.label ?? candidate.id,
          params,
          worldId: world.id,
          split: world.split ?? 'explore',
          simulations,
          metrics: flattenCellMetrics(simulations),
          failures: Object.values(simulations).flatMap((simulation) => simulation.failures),
        });
      }
    }
  }

  return {
    cells,
    parameterSets,
    candidates: campaign.candidates.map((candidate) => candidate.id),
    worlds: campaign.worlds.map((world) => world.id),
  };
}

function aggregateMetricAcrossCells(cells, metricName) {
  const values = cells
    .map((cell) => cell.metrics?.[metricName]?.mean)
    .filter(Number.isFinite);
  return stats(values);
}

export function summarizeMatrix(campaign, matrix) {
  const groups = new Map();

  for (const cell of matrix.cells) {
    const key = cell.configKey + '::' + cell.split;
    if (!groups.has(key)) {
      groups.set(key, {
        configKey: cell.configKey,
        candidateId: cell.candidateId,
        candidateLabel: cell.candidateLabel,
        params: cell.params,
        split: cell.split,
        cells: [],
      });
    }
    groups.get(key).cells.push(cell);
  }

  const summaries = [];
  const metricNames = new Set([
    ...(campaign.metrics ?? []).map((metric) => metric.name),
    ...matrix.cells.flatMap((cell) => Object.keys(cell.metrics ?? {})),
  ]);

  for (const group of groups.values()) {
    const metrics = {};
    for (const name of metricNames) metrics[name] = aggregateMetricAcrossCells(group.cells, name);
    summaries.push({
      configKey: group.configKey,
      candidateId: group.candidateId,
      candidateLabel: group.candidateLabel,
      params: group.params,
      split: group.split,
      worldCount: group.cells.length,
      metrics,
      failureCount: group.cells.reduce((sum, cell) => sum + cell.failures.length, 0),
    });
  }

  return summaries;
}

function constraintPass(summary, constraint) {
  const stat = constraint.stat ?? 'mean';
  const actual = summary.metrics?.[constraint.metric]?.[stat];
  if (!Number.isFinite(actual)) return false;
  if (constraint.operator === '>=') return actual >= constraint.value;
  if (constraint.operator === '<=') return actual <= constraint.value;
  if (constraint.operator === '>') return actual > constraint.value;
  if (constraint.operator === '<') return actual < constraint.value;
  return actual === constraint.value;
}

export function selectConfiguration(campaign, summaries) {
  if (!campaign.selection) return null;

  const split = campaign.selection.split ?? 'calibration';
  const eligible = summaries.filter((summary) =>
    summary.split === split &&
    (campaign.selection.constraints ?? []).every((constraint) => constraintPass(summary, constraint))
  );
  if (!eligible.length) return null;

  const objective = campaign.selection.objective;
  const stat = objective.stat ?? 'mean';
  const sorted = [...eligible].sort((a, b) => {
    const av = a.metrics?.[objective.metric]?.[stat];
    const bv = b.metrics?.[objective.metric]?.[stat];
    if (!Number.isFinite(av) && !Number.isFinite(bv)) return 0;
    if (!Number.isFinite(av)) return 1;
    if (!Number.isFinite(bv)) return -1;
    return objective.direction === 'lower' ? av - bv : bv - av;
  });

  const selected = sorted[0];
  const heldout = summaries.find((summary) =>
    summary.configKey === selected.configKey && summary.split === 'heldout'
  ) ?? null;
  const heldoutPassed = heldout
    ? (campaign.selection.constraints ?? []).every((constraint) => constraintPass(heldout, constraint))
    : null;

  return { selected, heldout, heldoutPassed, eligibleCount: eligible.length };
}

export function mineFailures(matrix) {
  const clusters = new Map();

  for (const cell of matrix.cells) {
    for (const failure of cell.failures) {
      const type = failure.type ?? 'unknown';
      const key = cell.configKey + '::' + cell.split + '::' + type;
      if (!clusters.has(key)) {
        clusters.set(key, {
          configKey: cell.configKey,
          candidateId: cell.candidateId,
          params: cell.params,
          split: cell.split,
          type,
          count: 0,
          examples: [],
        });
      }
      const cluster = clusters.get(key);
      cluster.count += 1;
      if (cluster.examples.length < 5) cluster.examples.push(failure);
    }
  }

  return [...clusters.values()].sort((a, b) => b.count - a.count);
}
