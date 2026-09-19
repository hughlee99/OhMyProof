import path from 'node:path';
import { applyPatch, candidateDiff } from './git.js';
import { detectAgent, implementCandidate } from './agents.js';

export async function prepareCandidate(state, options) {
  let agent = state.agent;
  let log = '';

  if (options.patch) {
    await applyPatch(state.worlds.candidate, path.resolve(options.patch));
    log = 'Candidate prepared from patch: ' + path.resolve(options.patch);
  } else {
    if (agent === 'auto') agent = await detectAgent(agent);
    const result = await implementCandidate(agent, state.worlds.candidate, state.proposal);
    log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  }

  const diff = await candidateDiff(state.worlds.candidate);
  return { agent: options.patch ? 'patch' : agent, log, diff };
}
