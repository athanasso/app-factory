import fs from 'fs';
import path from 'path';
import { getApps, getSettings, AppStatus } from '../db/store.js';
import { getBuildMetadata } from './build.js';
import { isJobRunning, startPipelineJob } from './queue.js';
import { getReleaseLifecycleStatus } from './releaseLifecycle.js';

const CONTENT_ROOT = () => path.resolve(process.cwd(), 'data', 'apps_content');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'build',
  '.gradle',
  'dist',
  'coverage',
  'android',
  'ios',
]);

function getUploadRecord(appId) {
  const filePath = path.join(CONTENT_ROOT(), appId, 'submission', 'play_console_upload.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getAabPath(app) {
  const meta = getBuildMetadata(app.id);
  if (meta?.aab?.bundlePath && fs.existsSync(meta.aab.bundlePath)) {
    return meta.aab.bundlePath;
  }
  if (!app.sourcePath) return null;
  const bundleDir = path.join(app.sourcePath, 'android', 'app', 'build', 'outputs', 'bundle', 'release');
  if (!fs.existsSync(bundleDir)) return null;
  const files = fs.readdirSync(bundleDir).filter((f) => f.endsWith('.aab'));
  return files.length ? path.join(bundleDir, files[0]) : null;
}

function hasRealScreenshotPngs(appId) {
  const shotsDir = path.join(CONTENT_ROOT(), appId, 'media', 'screenshots');
  if (!fs.existsSync(shotsDir)) return false;
  const pngs = fs.readdirSync(shotsDir).filter((f) => f.startsWith('phone_') && f.endsWith('.png'));
  return pngs.length >= 2;
}

function hasFeatureGraphicPng(appId) {
  return fs.existsSync(
    path.join(CONTENT_ROOT(), appId, 'media', 'feature_graphic_1024x500.png')
  );
}

function walkNewestMtime(dir, depth = 0, maxDepth = 4) {
  if (!fs.existsSync(dir) || depth > maxDepth) return 0;
  let newest = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        newest = Math.max(newest, walkNewestMtime(full, depth + 1, maxDepth));
      } else if (/\.(tsx?|jsx?|json|kt|java|xml|gradle|kts|png|svg)$/i.test(entry.name)) {
        newest = Math.max(newest, fs.statSync(full).mtimeMs);
      }
    } catch {
      // ignore locked / transient files
    }
  }
  return newest;
}

function getLatestSourceMtime(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return 0;
  const roots = ['app', 'src', 'components', 'screens', 'hooks', 'contexts', 'services', 'assets'];
  let newest = 0;
  for (const root of roots) {
    newest = Math.max(newest, walkNewestMtime(path.join(sourcePath, root)));
  }
  for (const file of ['package.json', 'app.json', 'app.config.js', 'app.config.ts']) {
    const p = path.join(sourcePath, file);
    if (fs.existsSync(p)) newest = Math.max(newest, fs.statSync(p).mtimeMs);
  }
  return newest;
}

/**
 * Decide whether an app needs first upload, RevenueCat second upload, or a normal update.
 */
export function getPublishNeeds(app) {
  if (!app?.isReal || !app.sourcePath || !fs.existsSync(app.sourcePath)) {
    return { action: 'none' };
  }

  const androidDir = path.join(app.sourcePath, 'android');
  if (!fs.existsSync(androidDir)) {
    return { action: 'none', reason: 'missing_android' };
  }

  const upload = getUploadRecord(app.id);
  const aabUploaded = upload?.bundleApiResult?.success === true;
  const aabPath = getAabPath(app);
  const aabExists = Boolean(aabPath && fs.existsSync(aabPath));
  const aabMtime = aabExists ? fs.statSync(aabPath).mtimeMs : 0;
  const uploadTime = upload?.timestamp ? Date.parse(upload.timestamp) : 0;
  const sourceMtime = getLatestSourceMtime(app.sourcePath);

  const hasShots = hasRealScreenshotPngs(app.id);
  const hasFg = hasFeatureGraphicPng(app.id);
  const lifecycle = getReleaseLifecycleStatus(app);

  // Phase 2: production RevenueCat key landed after first Play upload
  if (lifecycle.nextAction === 'second_upload') {
    return {
      action: 'second_upload',
      needsRebuild: true,
      needsUpload: true,
      aabPath,
      aabUploaded,
      hasShots,
      hasFg,
      lifecycle,
      summary: lifecycle.summary,
    };
  }

  // Waiting on manual RevenueCat / Play IAP setup — do not auto-build yet
  if (lifecycle.nextAction === 'wait_revenuecat') {
    return {
      action: 'none',
      reason: 'awaiting_revenuecat_setup',
      aabUploaded,
      lifecycle,
      summary: lifecycle.summary,
    };
  }

  const isFirstUpload = !aabUploaded;
  const needsAssetGen = isFirstUpload && (!hasShots || !hasFg);
  const needsRebuild = !aabExists || sourceMtime > aabMtime + 1000;
  const needsUpload = !aabUploaded || needsRebuild || (aabExists && aabMtime > uploadTime + 1000);

  if (!needsUpload && !needsAssetGen) {
    return { action: 'none', aabPath, aabUploaded, lifecycle };
  }

  return {
    action: isFirstUpload ? 'first_upload' : 'update',
    needsAssetGen,
    needsRebuild,
    needsUpload,
    aabPath,
    aabUploaded,
    hasShots,
    hasFg,
    lifecycle,
  };
}

let schedulerStarted = false;
let drainRunning = false;

async function drainPendingPublishes() {
  if (drainRunning) return;
  drainRunning = true;
  try {
    const settings = getSettings() || {};
    if (settings.autoPublishPending === false) return;

    const candidates = getApps()
      .map((app) => ({ app, needs: getPublishNeeds(app) }))
      .filter(({ needs }) => needs.action !== 'none');

    if (candidates.length === 0) return;

    console.log(`[AutoPublish] ${candidates.length} app(s) need upload/update`);

    for (const { app, needs } of candidates) {
      if (isJobRunning(app.id)) continue;
      if ([AppStatus.UPDATING, AppStatus.IN_REVIEW].includes(app.status)) continue;

      console.log(`[AutoPublish] Queuing ${app.name} (${needs.action})`);
      try {
        await startPipelineJob(app.id, {
          fromScratch: needs.action === 'first_upload',
          mode: needs.action,
          forceCompile: true,
        });
        // Only one pipeline at a time for Gradle / Metro stability
        break;
      } catch (err) {
        console.warn(`[AutoPublish] Failed to start ${app.id}: ${err.message}`);
      }
    }
  } finally {
    drainRunning = false;
  }
}

export function startAutoPublishScheduler({ initialDelayMs = 8000, intervalMs = 5 * 60 * 1000 } = {}) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log(`[AutoPublish] Scheduler armed — will upload/update apps + RC second uploads when ready`);
  setTimeout(() => {
    drainPendingPublishes().catch((err) => console.warn('[AutoPublish]', err.message));
  }, initialDelayMs);
  setInterval(() => {
    drainPendingPublishes().catch((err) => console.warn('[AutoPublish]', err.message));
  }, intervalMs);
}

export { drainPendingPublishes };
