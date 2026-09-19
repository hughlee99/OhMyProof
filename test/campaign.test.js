import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSweep, configKey } from '../src/campaign.js';
import { selectConfiguration } from '../src/campaign-runner.js';

test('campaign sweep expands cartesian product', () => {
  const rows = expandSweep({ TOP_K: [5, 10], THRESHOLD: [0.2, 0.3] });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { TOP_K: 5, THRESHOLD: 0.2 });
  assert.equal(configKey('char', rows[0]), 'char|THRESHOLD=0.2|TOP_K=5');
});

test('calibration selection applies constraints before objective', () => {
  const campaign = {
    selection: {
      split: 'calibration',
      constraints: [{ metric: 'recall', stat: 'min', operator: '>=', value: 0.99 }],
      objective: { metric: 'tokens', stat: 'mean', direction: 'lower' },
    },
  };
  const summaries = [
    { configKey: 'a', split: 'calibration', metrics: { recall: { min: 1 }, tokens: { mean: 900 } } },
    { configKey: 'b', split: 'calibration', metrics: { recall: { min: 0.98 }, tokens: { mean: 100 } } },
    { configKey: 'c', split: 'calibration', metrics: { recall: { min: 0.995 }, tokens: { mean: 300 } } },
    { configKey: 'c', split: 'heldout', metrics: { recall: { min: 0.994 }, tokens: { mean: 305 } } },
  ];
  const selected = selectConfiguration(campaign, summaries);
  assert.equal(selected.selected.configKey, 'c');
  assert.equal(selected.heldout.configKey, 'c');
  assert.equal(selected.eligibleCount, 2);
});
