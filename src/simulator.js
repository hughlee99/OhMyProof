import { runProcess } from './process.js';

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function parseMetrics(stdout, stderr = '') {
  const metrics = {};
  const text = stdout + '\n' + stderr;
  const regex = /OHMYPROOF_METRIC\s+([A-Za-z0-9_.:-]+)=(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let match;
  while ((match = regex.exec(text))) {
    const name = match[1];
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    if (!metrics[name]) metrics[name] = [];
    metrics[name].push(value);
  }
  return metrics;
}

async function runStep(step, cwd) {
  return await runProcess(step.argv, {
    cwd,
    timeoutMs: step.timeoutMs ?? 120000,
    env: step.env ?? {},
  });
}

export async function runWorld(plan, cwd, worldName) {
  const setup = [];
  for (const step of plan.setup ?? []) {
    const result = await runStep(step, cwd);
    setup.push(result);
    if (result.exitCode !== (step.expectExitCode ?? 0)) {
      return {
        world: worldName,
        cwd,
        setup,
        simulations: {},
        setupFailed: true,
      };
    }
  }

  const simulations = {};
  for (const sim of plan.simulations) {
    const runs = [];
    const repeats = sim.repeats ?? 1;
    for (let i = 0; i < repeats; i++) {
      const result = await runStep(sim, cwd);
      const custom = parseMetrics(result.stdout, result.stderr);
      runs.push({
        ...result,
        metrics: custom,
        expectedExitCode: sim.expectExitCode ?? 0,
        passed: result.exitCode === (sim.expectExitCode ?? 0) && !result.timedOut,
      });
    }
    simulations[sim.id] = summarizeSimulation(sim, runs);
  }

  return {
    world: worldName,
    cwd,
    setup,
    simulations,
    setupFailed: false,
  };
}

export function summarizeSimulation(sim, runs) {
  const durations = runs.map((r) => r.durationMs);
  const exitCodes = runs.map((r) => r.exitCode).filter((v) => Number.isFinite(v));
  const metricNames = new Set();
  for (const run of runs) {
    for (const name of Object.keys(run.metrics ?? {})) metricNames.add(name);
  }

  const metrics = {
    duration_ms: {
      median: median(durations),
      p95: percentile(durations, 95),
      samples: durations,
    },
    success_rate: {
      median: runs.filter((r) => r.passed).length / Math.max(1, runs.length),
      p95: null,
      samples: runs.map((r) => r.passed ? 1 : 0),
    },
    exit_code: {
      median: median(exitCodes),
      p95: percentile(exitCodes, 95),
      samples: exitCodes,
    },
  };

  for (const name of metricNames) {
    const values = [];
    for (const run of runs) {
      values.push(...(run.metrics?.[name] ?? []));
    }
    metrics[name] = {
      median: median(values),
      p95: percentile(values, 95),
      samples: values,
    };
  }

  return {
    id: sim.id,
    title: sim.title ?? sim.id,
    category: sim.category ?? 'behavior',
    argv: sim.argv,
    repeats: runs.length,
    passCount: runs.filter((r) => r.passed).length,
    metrics,
    runs,
  };
}

export async function runComparison(plan, baselineDir, candidateDir) {
  const baseline = await runWorld(plan, baselineDir, 'baseline');
  const candidate = await runWorld(plan, candidateDir, 'candidate');
  return { baseline, candidate };
}
