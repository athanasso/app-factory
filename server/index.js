import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { getApps, getAppById, updateApp, getStats, loadDb, addApp, getSettings, updateSettings, syncPlayTrackStatuses, reconcileStaleUpdatingStatuses, saveDb } from './db/store.js';
import { initWebSocket, broadcast } from './services/websocket.js';
import { startPipelineJob, isJobRunning } from './services/queue.js';
import { getTesterStatus, enrollTesters, promoteToProduction } from './services/testerAutomation.js';
import {
  getClosedTestStatus,
  startClosedTestRegistration,
  runDailyClosedTestProofs,
  markClosedTestRegistered,
  reservePartnerForApp,
  checkAdbDevice,
  runFullClosedTestCycle,
  runFullClosedTestCycleAll,
  runDailyProofAutomation,
} from './services/closedTestExchange.js';
import { saveClosedTestCredentials, loadClosedTestCredentials } from './services/closedTestApi.js';
import { getLiveMonetizationMetrics } from './services/monetization.js';
import { startAutoPublishScheduler, getPublishNeeds, drainPendingPublishes } from './services/autoPublish.js';
import { harvestPublisherDefaultsFromExistingApps } from './services/publisherDefaults.js';
import { syncAllPrivacyPolicyUrls } from './services/privacyPolicySync.js';
import {
  getReleaseLifecycleStatus,
  saveReleaseLifecycle,
  markRevenueCatReady,
} from './services/releaseLifecycle.js';
import {
  getPlayConsoleBrowserStatus,
  setupPlayConsoleSession,
  fillPlayConsoleAppContent,
  fillAllPlayConsoleAppContent,
} from './services/playConsoleBrowser.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Create HTTP server for both Express and WebSocket upgrades
const server = http.createServer(app);
initWebSocket(server);

// REST API Endpoints

// Get all apps and overall stats
app.get('/api/apps', (req, res) => {
  const apps = getApps();
  const stats = getStats();
  res.json({ apps, stats });
});

// Refresh Play production/alpha track detection
app.post('/api/apps/sync-tracks', async (req, res) => {
  try {
    const results = await syncPlayTrackStatuses(req.body?.appId || null);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Track sync failed' });
  }
});

// Clear orphaned Updating badges (pipelines crashed without restoring status)
app.post('/api/apps/reconcile-status', (req, res) => {
  try {
    const changed = reconcileStaleUpdatingStatuses();
    saveDb();
    broadcast({ type: 'APPS_REFRESH', apps: getApps(), stats: getStats() });
    res.json({ success: true, changed, apps: getApps(), stats: getStats() });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Reconcile failed' });
  }
});

// Create a new application in the factory
app.post('/api/apps', (req, res) => {
  const newApp = addApp(req.body || {});
  const stats = getStats();
  broadcast({ type: 'APP_UPDATE', app: newApp, stats });
  res.status(201).json({ app: newApp, stats });
});

// Get engine settings
app.get('/api/settings', (req, res) => {
  res.json(getSettings() || {});
});

// Update engine settings
app.post('/api/settings', (req, res) => {
  const updated = updateSettings(req.body || {});
  res.json(updated);
});

// Get single app details
app.get('/api/apps/:id', (req, res) => {
  const app = getAppById(req.params.id);
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }
  res.json({ app, isRunning: isJobRunning(req.params.id) });
});

// Update an app's details or metrics (revenue, downloads, etc.)
app.put('/api/apps/:id', (req, res) => {
  const updatedApp = updateApp(req.params.id, req.body || {});
  if (!updatedApp) {
    return res.status(404).json({ error: 'App not found' });
  }
  const stats = getStats();
  broadcast({ type: 'APP_UPDATE', app: updatedApp, stats });
  res.json({ app: updatedApp, stats });
});

// Run pipeline for an app
app.post('/api/apps/:id/pipeline/run', async (req, res) => {
  const { id } = req.params;
  const { fromScratch = true, mode, forceCompile = true } = req.body || {};

  try {
    if (isJobRunning(id)) {
      return res.status(400).json({ error: 'Pipeline is currently executing for this app.' });
    }

    const appItem = getAppById(id);
    const needs = appItem ? getPublishNeeds(appItem) : { action: 'full' };
    const resolvedMode = mode || (fromScratch ? 'first_upload' : needs.action === 'none' ? 'full' : needs.action);

    await startPipelineJob(id, { fromScratch, mode: resolvedMode, forceCompile });
    res.json({ success: true, message: `Pipeline execution triggered for app ${id}`, mode: resolvedMode });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to trigger pipeline' });
  }
});

// Inspect which apps still need first upload or AAB update
app.get('/api/publish/needs', (req, res) => {
  const apps = getApps().map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    ...getPublishNeeds(a),
  }));
  res.json({ apps, pending: apps.filter((a) => a.action !== 'none') });
});

// Rewrite Play listing privacy links to portfolio URLs (+ local listing.json)
app.post('/api/privacy-policies/sync-urls', async (req, res) => {
  try {
    const result = await syncAllPrivacyPolicyUrls({ dryRun: Boolean(req.body?.dryRun) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Privacy URL sync failed' });
  }
});

// Play Console Chrome session (ShortsMachine-style dedicated profile)
app.get('/api/play-console/browser/status', (req, res) => {
  res.json(getPlayConsoleBrowserStatus());
});

app.post('/api/play-console/browser/setup', async (req, res) => {
  try {
    const result = await setupPlayConsoleSession();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Play Console Chrome setup failed' });
  }
});

app.post('/api/apps/:id/play-console/fill', async (req, res) => {
  try {
    const appItem = getAppById(req.params.id);
    if (!appItem) return res.status(404).json({ error: 'App not found' });
    const steps = req.body?.steps;
    const result = await fillPlayConsoleAppContent(appItem, {
      steps: Array.isArray(steps) && steps.length ? steps : undefined,
      minimized: req.body?.minimized !== false,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Play Console fill failed',
      diagnostics: error.diagnostics || null,
    });
  }
});

app.post('/api/play-console/browser/probe', async (req, res) => {
  try {
    const { withProbe } = await import('./services/playConsoleBrowser.js');
    const result = await withProbe();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message, diagnostics: error.diagnostics || null });
  }
});

app.post('/api/play-console/fill-all', async (req, res) => {
  try {
    const result = await fillAllPlayConsoleAppContent({
      steps: req.body?.steps,
      minimized: req.body?.minimized !== false,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Play Console fill-all failed' });
  }
});

// Release lifecycle checklist (first upload → RC setup → second upload → closed test → prod)
app.get('/api/apps/:id/lifecycle', (req, res) => {
  const appItem = getAppById(req.params.id);
  if (!appItem) return res.status(404).json({ error: 'App not found' });
  res.json(getReleaseLifecycleStatus(appItem));
});

app.get('/api/lifecycle', (req, res) => {
  res.json({
    apps: getApps().map((a) => getReleaseLifecycleStatus(a)),
  });
});

// Mark manual RevenueCat checklist items done (Play products / RC dashboard), then maybe second upload
app.post('/api/apps/:id/lifecycle/rc-ready', async (req, res) => {
  try {
    const appItem = getAppById(req.params.id);
    if (!appItem) return res.status(404).json({ error: 'App not found' });
    const body = req.body || {};
    saveReleaseLifecycle(appItem.id, {
      playProductsReady: body.playProductsReady !== false,
      revenueCatGoogleLinked: body.revenueCatGoogleLinked !== false,
      revenueCatOfferingsReady: body.revenueCatOfferingsReady !== false,
    });
    const status = getReleaseLifecycleStatus(appItem);
    if (status.revenueCat?.ready) {
      markRevenueCatReady(appItem.id);
    }
    // Kick auto-publish so second_upload can start if goog_ key is present
    drainPendingPublishes().catch(() => {});
    res.json({ success: true, lifecycle: getReleaseLifecycleStatus(getAppById(appItem.id)) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update lifecycle' });
  }
});

// Manually kick the auto-publish drain (upload/update missing apps)
app.post('/api/publish/auto', async (req, res) => {
  try {
    await drainPendingPublishes();
    res.json({ success: true, message: 'Auto-publish drain triggered' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Auto-publish failed' });
  }
});

// Testing automation endpoints (Mandatory for Personal Google Play Developer Accounts)
app.get('/api/apps/:id/testing', (req, res) => {
  const status = getTesterStatus(req.params.id) || {
    appId: req.params.id,
    accountType: 'Personal',
    isTestingMandatory: true,
    statusState: 'IN_PROGRESS',
    currentDay: 7,
    totalDays: 14,
    requiredTesters: 12,
    enrolledTesters: 12
  };
  res.json(status);
});

app.post('/api/apps/:id/testing/enroll', async (req, res) => {
  try {
    const { testerEmails, customDay } = req.body || {};
    const status = await enrollTesters(req.params.id, testerEmails, customDay);
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Enrollment failed' });
  }
});

app.post('/api/apps/:id/testing/promote', async (req, res) => {
  try {
    const status = await promoteToProduction(req.params.id);
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Promotion to production failed' });
  }
});

// TheClosedTest peer-swap (Personal accounts, apps not yet in production)
app.get('/api/closed-test', (req, res) => {
  res.json(getClosedTestStatus(req.query.appId || null));
});

app.get('/api/closed-test/adb', async (req, res) => {
  res.json(await checkAdbDevice());
});

app.post('/api/apps/:id/closed-test/register', async (req, res) => {
  try {
    const result = await startClosedTestRegistration(req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'ClosedTest registration failed' });
  }
});

app.post('/api/apps/:id/closed-test/mark-registered', (req, res) => {
  try {
    const result = markClosedTestRegistered(req.params.id, req.body || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/apps/:id/closed-test/reserve-partner', (req, res) => {
  try {
    const { partnerPackageName, partnerAppId } = req.body || {};
    const result = reservePartnerForApp(req.params.id, partnerPackageName, partnerAppId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/closed-test/daily-proofs', async (req, res) => {
  try {
    const appId = req.body?.appId || null;
    // Prefer full API+ADB automation; fall back to ADB-only helper
    let result;
    try {
      result = await runDailyProofAutomation(appId);
    } catch (err) {
      result = await runDailyClosedTestProofs(appId);
      result.fallbackError = err.message;
    }
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Daily proofs failed' });
  }
});

app.post('/api/apps/:id/closed-test/full-cycle', async (req, res) => {
  try {
    const result = await runFullClosedTestCycle(req.params.id, req.body || {});
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Full cycle failed' });
  }
});

app.post('/api/closed-test/full-cycle-all', async (req, res) => {
  try {
    const result = await runFullClosedTestCycleAll(req.body || {});
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Full cycle-all failed' });
  }
});

app.get('/api/closed-test/credentials', (req, res) => {
  const c = loadClosedTestCredentials();
  res.json({
    hasClerkJwt: Boolean(c.clerkJwt),
    apiBase: c.apiBase,
    jwtPreview: c.clerkJwt ? `${c.clerkJwt.slice(0, 12)}…` : null,
  });
});

app.post('/api/closed-test/credentials', (req, res) => {
  try {
    const saved = saveClosedTestCredentials(req.body || {});
    if (req.body?.clerkJwt != null) {
      updateSettings({ closedTestClerkJwt: String(req.body.clerkJwt).trim() });
    }
    if (req.body?.apiBase != null) {
      updateSettings({ closedTestApiBase: String(req.body.apiBase).trim() });
    }
    res.json({
      success: true,
      hasClerkJwt: Boolean(saved.clerkJwt),
      apiBase: saved.apiBase,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Refresh db (scan filesystem again for any newly created RN projects)
app.post('/api/refresh', (req, res) => {
  loadDb();
  res.json({ success: true, apps: getApps(), stats: getStats() });
});

// Serve actual app icon image from the React Native codebase
app.get('/api/apps/:id/icon', (req, res) => {
  const appItem = getAppById(req.params.id);
  if (!appItem || !appItem.sourcePath) {
    return res.status(404).send('Icon not found');
  }

  const potentialPaths = [
    path.join(appItem.sourcePath, 'assets', 'images', 'icon.png'),
    path.join(appItem.sourcePath, 'assets', 'icon.png'),
    path.join(appItem.sourcePath, 'assets', 'images', 'app-icon.png'),
    path.join(appItem.sourcePath, 'assets', 'images', 'adaptive-icon.png'),
    path.join(appItem.sourcePath, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png')
  ];

  for (const iconPath of potentialPaths) {
    if (fs.existsSync(iconPath)) {
      return res.sendFile(iconPath);
    }
  }
  res.status(404).send('Icon PNG not found on disk');
});

// Ad Revenue & IAP Monetization API endpoints for the Dedicated UI Modal
app.get('/api/monetization/all', async (req, res) => {
  try {
    const allApps = getApps();
    let totalAdMobRevenue = 0;
    let totalPlayStoreRevenue = 0;
    let totalIapSkus = 0;
    let totalSubSkus = 0;
    let totalImpressions = 0;
    
    const appBreakdowns = await Promise.all(allApps.map(async (a) => {
      const metrics = await getLiveMonetizationMetrics(a);
      totalAdMobRevenue += (metrics.admobMetrics?.revenue || 0);
      totalPlayStoreRevenue += (metrics.iapMetrics?.revenue || 0);
      totalIapSkus += (metrics.iapMetrics?.iapCount || 0);
      totalSubSkus += (metrics.iapMetrics?.subscriptionCount || 0);
      totalImpressions += (metrics.admobMetrics?.impressions || 0);
      return {
        appId: a.id,
        appName: a.name,
        packageName: a.packageName,
        icon: a.icon,
        iconUrl: a.iconUrl,
        admobRevenue: metrics.admobMetrics?.revenue || 0,
        playStoreRevenue: metrics.iapMetrics?.revenue || 0,
        impressions: metrics.admobMetrics?.impressions || 0,
        eCPM: metrics.admobMetrics?.eCPM || '$0.00',
        iapCount: metrics.iapMetrics?.iapCount || 0,
        subscriptionCount: metrics.iapMetrics?.subscriptionCount || 0,
        skuDetails: metrics.iapMetrics?.skuDetails || [],
        platform: metrics.iapMetrics?.platform || 'Google Play Console',
        isLive: metrics.isVerifiedLive
      };
    }));

    const now = new Date();
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    res.json({
      success: true,
      monitoredMonth: monthName,
      totalAdMobRevenue: parseFloat(totalAdMobRevenue.toFixed(2)),
      totalPlayStoreRevenue: parseFloat(totalPlayStoreRevenue.toFixed(2)),
      totalIapSkus,
      totalSubSkus,
      totalImpressions,
      averageEcpm: totalImpressions > 0 ? `$${((totalAdMobRevenue / totalImpressions) * 1000).toFixed(2)}` : '$0.00',
      apps: appBreakdowns
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to compute monetization metrics' });
  }
});

app.get('/api/apps/:id/monetization', async (req, res) => {
  try {
    const appItem = getAppById(req.params.id);
    if (!appItem) return res.status(404).json({ error: 'App not found' });
    const metrics = await getLiveMonetizationMetrics(appItem);
    res.json({ success: true, app: appItem, metrics });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch monetization details for app' });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🏭 App Factory Backend API operational on port ${PORT}`);
  console.log(`  🔌 Real-time WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`  📂 Scanning published apps root: ${process.env.PROJECTS_ROOT || 'D:/Projects/RN/published'}`);
  console.log(`======================================================\n`);
  startAutoPublishScheduler();
  harvestPublisherDefaultsFromExistingApps()
    .then((d) => {
      console.log(
        `[Publisher Defaults] Ready · ${d.contactEmail} · ${d.contactWebsite} · ${d.testerGoogleGroups?.length || 0} tester groups`
      );
    })
    .catch((err) => console.warn('[Publisher Defaults] Harvest skipped:', err.message));
});
