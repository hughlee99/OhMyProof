import fs from 'node:fs/promises';

const SPLITS = new Set(['explore', 'calibration', 'heldout']);
const DIRECTIONS = new Set(['higher', 'lower']);

export async function loadCampaign(file) {
  const campaign = JSON.parse(await fs.readFile(file, 'utf8'));
  validateCampaign(campaign);
  return campaign;
}

export function validateCampaign(campaign) {
  if (!campaign || campaign.version !== 1) throw new Error('campaign.json must use version: 1');
  if (!campaign.question || typeof campaign.question !== 'string') throw new Error('campaign.question is required');
  if (!Array.isArray(campaign.candidates) || campaign.candidates.length < 2) throw new Error('campaign requires at least two candidates');
  if (!Array.isArray(campaign.worlds) || campaign.worlds.length < 1) throw new Error('campaign requires at least one world');
  if (!Array.isArray(campaign.simulations) || campaign.simulations.length < 1) throw new Error('campaign requires at least one simulation');

  const candidateIds = new Set();
  for (const candidate of campaign.candidates) {
    if (!candidate.id || candidateIds.has(candidate.id)) throw new Error('Candidate ids must be unique and non-empty');
    candidateIds.add(candidate.id);
  }

  const worldIds = new Set();
  for (const world of campaign.worlds) {
    if (!world.id || worldIds.has(world.id)) throw new Error('World ids must be unique and non-empty');
    worldIds.add(world.id);
    const split = world.split ?? 'explore';
    if (!SPLITS.has(split)) throw new Error('Unknown world split: ' + split);
  }

  for (const simulation of campaign.simulations) {
    if (!simulation.id) throw new Error('Every simulation needs an id');
    if (!Array.isArray(simulation.argv) || simulation.argv.length < 1) {
      throw new Error('Simulation ' + simulation.id + ' requires argv');
    }
  }

  for (const metric of campaign.metrics ?? []) {
    if (!metric.name) throw new Error('Every metric needs a name');
    if (!DIRECTIONS.has(metric.direction)) throw new Error('Metric ' + metric.name + ' must use direction higher|lower');
  }

  if (campaign.selection) {
    const objective = campaign.selection.objective;
    if (!objective?.metric || !DIRECTIONS.has(objective.direction)) {
      throw new Error('selection.objective requires metric and higher|lower direction');
    }
    for (const constraint of campaign.selection.constraints ?? []) {
      if (!constraint.metric || !['>=', '<=', '>', '<', '=='].includes(constraint.operator)) {
        throw new Error('Invalid selection constraint');
      }
      if (!Number.isFinite(constraint.value)) throw new Error('Selection constraint value must be numeric');
    }
  }

  return campaign;
}

export function expandSweep(sweep = {}) {
  const entries = Object.entries(sweep);
  if (!entries.length) return [{}];

  let rows = [{}];
  for (const [key, values] of entries) {
    if (!Array.isArray(values) || !values.length) throw new Error('Sweep ' + key + ' must be a non-empty array');
    const next = [];
    for (const row of rows) {
      for (const value of values) next.push({ ...row, [key]: value });
    }
    rows = next;
  }
  return rows;
}

export function configKey(candidateId, params = {}) {
  const pairs = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + String(value));
  return candidateId + (pairs.length ? '|' + pairs.join('|') : '');
}

export function campaignWarnings(campaign) {
  const warnings = [];
  const splits = new Set(campaign.worlds.map((w) => w.split ?? 'explore'));
  if (campaign.selection && !splits.has(campaign.selection.split ?? 'calibration')) warnings.push('Selection split has no worlds.');
  if (campaign.selection && !splits.has('heldout')) warnings.push('No heldout worlds exist.');
  if (!campaign.failureMining?.enabled) warnings.push('Failure mining is disabled.');
  if (campaign.candidates.length < 3) warnings.push('Alternative search space may be narrow.');
  return warnings;
}
