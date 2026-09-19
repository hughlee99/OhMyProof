import fs from 'node:fs/promises';
import path from 'node:path';

export async function installBundle(state) {
  for (const world of [state.worlds.baseline, state.worlds.candidate]) {
    const target = path.join(world, '.ohmyproof');
    await fs.mkdir(target, { recursive: true });

    if (state.needsPlanner) {
      await fs.cp(path.join(state.worlds.planner, '.ohmyproof'), target, {
        recursive: true,
        force: true,
      });
    } else {
      await fs.copyFile(state.planPath, path.join(target, 'experiment.json'));
      const simSource = path.join(path.dirname(state.planPath), 'sim');
      try {
        await fs.access(simSource);
        await fs.cp(simSource, path.join(target, 'sim'), {
          recursive: true,
          force: true,
        });
      } catch {}
    }
  }
}
