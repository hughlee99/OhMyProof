import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCampaign, campaignWarnings } from './campaign.js';
import { runCampaignMatrix, summarizeMatrix, selectConfiguration, mineFailures } from './campaign-runner.js';
import { renderCampaignReport } from './campaign-report.js';
import { redactObject, redactText } from './security.js';

function runId() {
  return 'campaign-' + new Date().toISOString().replace(/[:.]/g, '-');
}

export async function runCampaignFile(options) {
  const campaignPath = path.resolve(options.campaign);
  const cwd = path.resolve(options.repo ?? path.dirname(campaignPath));
  const campaign = await loadCampaign(campaignPath);
  const id = runId();

  const matrix = await runCampaignMatrix(campaign, cwd);
  const summaries = summarizeMatrix(campaign, matrix);
  const selection = selectConfiguration(campaign, summaries);
  const failures = campaign.failureMining?.enabled ? mineFailures(matrix) : [];
  const warnings = campaignWarnings(campaign);

  const report = renderCampaignReport({
    runId: id,
    campaign,
    summaries,
    selection,
    failures,
    warnings,
  });

  const reportRoot = path.resolve(options.reportRoot ?? cwd);
  const reportDir = path.join(reportRoot, '.ohmyproof', 'reports', id);
  await fs.mkdir(reportDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(reportDir, 'campaign.json'), JSON.stringify(redactObject(campaign), null, 2), 'utf8'),
    fs.writeFile(path.join(reportDir, 'matrix.json'), JSON.stringify(redactObject(matrix), null, 2), 'utf8'),
    fs.writeFile(path.join(reportDir, 'summaries.json'), JSON.stringify(redactObject(summaries), null, 2), 'utf8'),
    fs.writeFile(path.join(reportDir, 'failure-clusters.json'), JSON.stringify(redactObject(failures), null, 2), 'utf8'),
    fs.writeFile(path.join(reportDir, 'report.md'), redactText(report), 'utf8'),
  ]);

  return {
    runId: id,
    reportDir,
    report,
    campaign,
    matrix,
    summaries,
    selection,
    failures,
    warnings,
  };
}
