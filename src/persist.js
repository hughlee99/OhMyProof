import fs from 'node:fs/promises';
import path from 'node:path';
import { redactObject, redactText } from './security.js';

export async function persistProof(state, candidate, result) {
  await fs.writeFile(
    path.join(state.reportDir, 'proof.json'),
    JSON.stringify(redactObject(result.proof), null, 2),
    'utf8'
  );
  await fs.writeFile(path.join(state.reportDir, 'report.md'), redactText(result.report), 'utf8');
  await fs.writeFile(
    path.join(state.reportDir, 'experiment.json'),
    JSON.stringify(redactObject(state.plan), null, 2),
    'utf8'
  );
  await fs.writeFile(path.join(state.reportDir, 'candidate.diff'), redactText(candidate.diff), 'utf8');
  await fs.writeFile(path.join(state.reportDir, 'planner-agent.log'), redactText(state.plannerLog ?? ''), 'utf8');
  await fs.writeFile(path.join(state.reportDir, 'candidate-agent.log'), redactText(candidate.log ?? ''), 'utf8');

  return state.reportDir;
}
