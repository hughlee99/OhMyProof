import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getRepoRoot, createWorlds, cleanupWorlds } from './git.js';
import { designCampaign } from './campaign-agent.js';
import { runCampaignFile } from './campaign-run.js';

export async function investigate(options) {
  const root = await getRepoRoot(path.resolve(options.repo ?? process.cwd()));
  const tempId = 'investigate-' + new Date().toISOString().replace(/[:.]/g, '-');
  const runRoot = path.join(os.tmpdir(), 'ohmyproof', tempId);
  const created = await createWorlds(root, runRoot, true);

  try {
    const designed = await designCampaign({
      agent: options.agent ?? 'auto',
      cwd: created.worlds.planner,
      question: options.question,
    });

    const result = await runCampaignFile({
      campaign: designed.campaignPath,
      repo: created.worlds.planner,
      reportRoot: root,
    });

    const bundleSource = path.join(created.worlds.planner, '.ohmyproof', 'campaign');
    const bundleTarget = path.join(result.reportDir, 'campaign-bundle');
    await fs.cp(bundleSource, bundleTarget, { recursive: true, force: true });
    await fs.writeFile(
      path.join(result.reportDir, 'planner-agent.log'),
      [designed.stdout, designed.stderr].filter(Boolean).join('\n'),
      'utf8'
    );

    return { ...result, agent: designed.agent };
  } finally {
    if (!options.keep) await cleanupWorlds(root, created.worlds);
  }
}
