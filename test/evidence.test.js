import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidence } from '../src/evidence.js';

test('claim is supported by deterministic metric improvement', () => {
  const plan = {
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
    guardrails: [{
      simulation: 'tests',
      metric: 'success_rate',
      direction: 'not_lower',
      tolerancePct: 0,
      label: 'Regression suite',
    }],
    unknowns: [],
  };

  const comparison = {
    baseline: {
      simulations: {
        bench: { metrics: { latency_ms: { median: 100 } } },
        tests: { metrics: { success_rate: { median: 1 } } },
      },
    },
    candidate: {
      simulations: {
        bench: { metrics: { latency_ms: { median: 60 } } },
        tests: { metrics: { success_rate: { median: 1 } } },
      },
    },
  };

  const evidence = buildEvidence(plan, comparison);
  assert.equal(evidence.claims[0].status, 'SUPPORTED');
  assert.equal(evidence.regressions.length, 0);
  assert.equal(Math.round(evidence.claims[0].evidence[0].improvementPct), 40);
});

test('guardrail regression is reported separately from the claim', () => {
  const plan = {
    claims: [],
    guardrails: [{
      simulation: 'tests',
      metric: 'success_rate',
      direction: 'not_lower',
      tolerancePct: 0,
      label: 'Existing tests',
    }],
  };

  const comparison = {
    baseline: { simulations: { tests: { metrics: { success_rate: { median: 1 } } } } },
    candidate: { simulations: { tests: { metrics: { success_rate: { median: 0.5 } } } } },
  };

  const evidence = buildEvidence(plan, comparison);
  assert.equal(evidence.regressions.length, 1);
  assert.equal(evidence.regressions[0].status, 'CONTRADICTED');
});
