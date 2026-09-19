import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runComparison } from '../src/simulator.js';
import { buildEvidence } from '../src/evidence.js';

test('same simulation runs against baseline and candidate', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ohmyproof-sim-'));
  const baseline = path.join(root, 'baseline');
  const candidate = path.join(root, 'candidate');
  await fs.mkdir(baseline);
  await fs.mkdir(candidate);

  const script = [
    "import fs from 'node:fs';",
    "const value = Number(fs.readFileSync('latency.txt', 'utf8'));",
    "console.log('OHMYPROOF_METRIC latency_ms=' + value);",
  ].join('\n');

  await fs.writeFile(path.join(baseline, 'sim.mjs'), script);
  await fs.writeFile(path.join(candidate, 'sim.mjs'), script);
  await fs.writeFile(path.join(baseline, 'latency.txt'), '100');
  await fs.writeFile(path.join(candidate, 'latency.txt'), '40');

  const plan = {
    version: 1,
    claims: [{
      id: 'C1',
      statement: 'Latency decreases',
      evidence: [{
        simulation: 'bench',
        metric: 'latency_ms',
        direction: 'lower',
        minImprovementPct: 10,
        maxRegressionPct: 5,
      }],
    }],
    simulations: [{
      id: 'bench',
      title: 'Synthetic latency replay',
      category: 'performance',
      argv: ['node', 'sim.mjs'],
      repeats: 3,
      timeoutMs: 10000,
      expectExitCode: 0,
    }],
    guardrails: [],
  };

  const comparison = await runComparison(plan, baseline, candidate);
  const evidence = buildEvidence(plan, comparison);

  assert.equal(comparison.baseline.simulations.bench.passCount, 3);
  assert.equal(comparison.candidate.simulations.bench.passCount, 3);
  assert.equal(comparison.baseline.simulations.bench.metrics.latency_ms.median, 100);
  assert.equal(comparison.candidate.simulations.bench.metrics.latency_ms.median, 40);
  assert.equal(evidence.claims[0].status, 'SUPPORTED');

  await fs.rm(root, { recursive: true, force: true });
});
