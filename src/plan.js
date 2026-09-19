import fs from 'node:fs/promises';
import path from 'node:path';

const DIRECTIONS = new Set(['lower', 'higher', 'not_lower', 'not_higher', 'equal']);

export async function loadPlan(planPath) {
  const raw = await fs.readFile(planPath, 'utf8');
  const plan = JSON.parse(raw);
  validatePlan(plan);
  return plan;
}

export function validatePlan(plan) {
  if (!plan || plan.version !== 1) throw new Error('experiment.json must use version: 1');
  if (!Array.isArray(plan.simulations) || plan.simulations.length === 0) {
    throw new Error('experiment.json must contain at least one simulation');
  }

  const ids = new Set();
  for (const sim of plan.simulations) {
    if (!sim.id || typeof sim.id !== 'string') throw new Error('Every simulation needs an id');
    if (ids.has(sim.id)) throw new Error('Duplicate simulation id: ' + sim.id);
    ids.add(sim.id);
    if (!Array.isArray(sim.argv) || sim.argv.length === 0 || !sim.argv.every((x) => typeof x === 'string')) {
      throw new Error('Simulation ' + sim.id + ' must use a string argv array');
    }
    if (sim.repeats !== undefined && (!Number.isInteger(sim.repeats) || sim.repeats < 1 || sim.repeats > 100)) {
      throw new Error('Simulation ' + sim.id + ' repeats must be an integer between 1 and 100');
    }
  }

  for (const setup of plan.setup ?? []) {
    if (!Array.isArray(setup.argv) || setup.argv.length === 0) throw new Error('Each setup step needs argv');
  }

  for (const claim of plan.claims ?? []) {
    if (!claim.id || !claim.statement) throw new Error('Each claim needs id and statement');
    for (const ev of claim.evidence ?? []) {
      if (!ids.has(ev.simulation)) throw new Error('Claim ' + claim.id + ' references unknown simulation ' + ev.simulation);
      if (!DIRECTIONS.has(ev.direction)) throw new Error('Unsupported direction: ' + ev.direction);
    }
  }

  for (const guard of plan.guardrails ?? []) {
    if (!ids.has(guard.simulation)) throw new Error('Guardrail references unknown simulation ' + guard.simulation);
    if (!DIRECTIONS.has(guard.direction)) throw new Error('Unsupported guardrail direction: ' + guard.direction);
  }

  return plan;
}

export async function copyExperimentBundle(sourceDir, destinationWorlds) {
  const source = path.resolve(sourceDir);
  for (const world of destinationWorlds) {
    const target = path.join(world, '.ohmyproof');
    await fs.rm(target, { recursive: true, force: true });
    await fs.cp(source, target, { recursive: true });
  }
}

export function experimentWarnings(plan) {
  const warnings = [];
  const categories = new Set((plan.simulations ?? []).map((s) => s.category));
  if (![...categories].some((x) => ['edge', 'fault', 'load'].includes(x))) {
    warnings.push('No edge/fault/load simulation is defined; falsification coverage may be weak.');
  }
  if (!(plan.guardrails ?? []).length) {
    warnings.push('No independent guardrails are defined.');
  }
  if (!(plan.claims ?? []).length) {
    warnings.push('No explicit claims are defined.');
  }
  return warnings;
}
