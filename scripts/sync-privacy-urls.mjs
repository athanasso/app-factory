import { syncAllPrivacyPolicyUrls } from '../server/services/privacyPolicySync.js';
import { generatePrivacyPolicy } from '../server/services/privacyPolicy.js';
import { getApps } from '../server/db/store.js';

const dryRun = process.argv.includes('--dry-run');

const apps = (getApps() || []).filter((a) => a.isReal);
for (const app of apps) {
  try {
    const r = await generatePrivacyPolicy(app, { force: false });
    console.log(r.summary || r.url);
  } catch (err) {
    console.warn(`[gen] ${app.name}: ${err.message}`);
  }
}

const result = await syncAllPrivacyPolicyUrls({ dryRun });
console.log(JSON.stringify({
  summary: result.summary,
  count: result.count,
  reportPath: result.reportPath,
  manualAppContentRequired: result.manualAppContentRequired,
}, null, 2));
