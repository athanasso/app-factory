import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { getApps, getAppById, updateApp, getStats, loadDb, addApp, getSettings, updateSettings } from './db/store.js';
import { initWebSocket, broadcast } from './services/websocket.js';
import { startPipelineJob, isJobRunning } from './services/queue.js';
import { getTesterStatus, enrollTesters, promoteToProduction } from './services/testerAutomation.js';
import { getLiveMonetizationMetrics } from './services/monetization.js';

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
  const { fromScratch = true } = req.body || {};

  try {
    if (isJobRunning(id)) {
      return res.status(400).json({ error: 'Pipeline is currently executing for this app.' });
    }
    
    await startPipelineJob(id, { fromScratch });
    res.json({ success: true, message: `Pipeline execution triggered for app ${id}` });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to trigger pipeline' });
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
});
