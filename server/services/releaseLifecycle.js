import fs from 'fs';
import path from 'path';
import { detectMonetizationUsage } from './monetizationIntegration.js';
import { getTesterStatus } from './testerAutomation.js';

const CONTENT_ROOT = () => path.resolve(process.cwd(), 'data', 'apps_content');

const RC_ANDROID_KEYS = [
  'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID',
  'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
  'EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY',
  'EXPO_PUBLIC_REVENUECAT_API_KEY',
];

const PLACEHOLDER_RE = /your_|YOUR_|dummy|XXXXXXXX|placeholder|changeme|key_here|test_|sk_test/i;
const TEST_STORE_HINT = /test.?store|teststore/i;

function lifecyclePath(appId) {
  return path.join(CONTENT_ROOT(), appId, 'submission', 'release_lifecycle.json');
}

function uploadPath(appId) {
  return path.join(CONTENT_ROOT(), appId, 'submission', 'play_console_upload.json');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function parseEnv(sourcePath) {
  const envPath = path.join(sourcePath, '.env');
  const map = {};
  if (!fs.existsSync(envPath)) return map;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return map;
}

/**
 * RevenueCat Android public SDK key ready for Play testing / production
 * (goog_… keys — not Test Store / placeholders).
 */
export function getRevenueCatAndroidKeyStatus(sourcePath) {
  if (!sourcePath) return { ready: false, status: 'missing', keyPresent: false };
  const env = parseEnv(sourcePath);
  let value = null;
  for (const k of RC_ANDROID_KEYS) {
    if (env[k] && String(env[k]).trim()) {
      value = String(env[k]).trim();
      break;
    }
  }
  if (!value) return { ready: false, status: 'missing', keyPresent: false };
  if (PLACEHOLDER_RE.test(value) || TEST_STORE_HINT.test(value)) {
    return { ready: false, status: 'placeholder_or_test', keyPresent: true };
  }
  if (/^goog_/.test(value)) return { ready: true, status: 'production', keyPresent: true };
  // Some projects use a shared EXPO_PUBLIC_REVENUECAT_API_KEY that is still usable
  if (value.length > 12) return { ready: true, status: 'set', keyPresent: true };
  return { ready: false, status: 'invalid', keyPresent: true };
}

export function loadReleaseLifecycle(appId) {
  return (
    readJson(lifecyclePath(appId)) || {
      phase: 'not_started',
      firstUploadAt: null,
      secondUploadAt: null,
      revenueCatReadyAt: null,
      notes: [],
    }
  );
}

export function saveReleaseLifecycle(appId, updates) {
  const prev = loadReleaseLifecycle(appId);
  const next = { ...prev, ...updates, updatedAt: new Date().toISOString() };
  return writeJson(lifecyclePath(appId), next);
}

export function markFirstUploadComplete(appId, meta = {}) {
  return saveReleaseLifecycle(appId, {
    phase: 'awaiting_revenuecat_setup',
    firstUploadAt: new Date().toISOString(),
    firstUploadMeta: meta,
  });
}

export function markRevenueCatReady(appId) {
  return saveReleaseLifecycle(appId, {
    phase: 'ready_for_second_upload',
    revenueCatReadyAt: new Date().toISOString(),
  });
}

export function markSecondUploadComplete(appId, meta = {}) {
  return saveReleaseLifecycle(appId, {
    phase: 'closed_testing',
    secondUploadAt: new Date().toISOString(),
    secondUploadMeta: meta,
  });
}

/**
 * Full remaining-process checklist after first Play upload (RevenueCat + closed test + prod).
 */
export function getReleaseLifecycleStatus(app) {
  const usage = detectMonetizationUsage(app.sourcePath);
  const upload = readJson(uploadPath(app.id));
  const life = loadReleaseLifecycle(app.id);
  const aabUploaded = upload?.bundleApiResult?.success === true;
  const rc = getRevenueCatAndroidKeyStatus(app.sourcePath);
  const testing = getTesterStatus(app.id);

  const checklist = [];

  checklist.push({
    id: 'play_first_aab',
    title: 'Upload signed AAB to Play (alpha/internal)',
    done: aabUploaded || Boolean(life.firstUploadAt),
    required: true,
    note: 'Required before Play IAP products and RevenueCat Google linking can work.',
  });

  checklist.push({
    id: 'play_store_overview',
    title: 'Store overview (email, website, tester groups)',
    done: Boolean(upload?.overviewApiResult?.success) || Boolean(life.firstUploadAt),
    required: true,
  });

  if (usage.usesAdMob) {
    checklist.push({
      id: 'admob_ids',
      title: 'Wire production AdMob App + ad unit IDs',
      done: true, // handled in first-upload monetization step; soft check
      required: true,
      note: 'From .env / monetization.json / AdMob API lookup.',
    });
  }

  if (usage.usesRevenueCat) {
    checklist.push({
      id: 'play_iap_products',
      title: 'Create & activate Play Console subscriptions / IAPs',
      done: Boolean(life.playProductsReady),
      required: true,
      note: 'Play only allows this AFTER the first AAB upload. Create base plans and Activate them.',
      manual: true,
    });
    checklist.push({
      id: 'rc_google_credentials',
      title: 'Connect RevenueCat ↔ Google Play service account',
      done: Boolean(life.revenueCatGoogleLinked),
      required: true,
      note: 'Upload Play service-account JSON in RevenueCat → Project → Service credentials.',
      manual: true,
    });
    checklist.push({
      id: 'rc_products_entitlements',
      title: 'Import products + attach entitlements / offerings in RevenueCat',
      done: Boolean(life.revenueCatOfferingsReady),
      required: true,
      note: 'Import from Play, map to entitlement used by the app (e.g. “… Pro”).',
      manual: true,
    });
    checklist.push({
      id: 'rc_prod_sdk_key',
      title: 'Put Android public SDK key (goog_…) into app .env',
      done: rc.ready,
      required: true,
      note: 'NOT the Test Store key. Keys: EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID / _ANDROID_KEY / etc.',
      manual: !rc.ready,
    });
    checklist.push({
      id: 'second_aab_upload',
      title: 'Second upload: rebuild AAB with production RevenueCat key',
      done: Boolean(life.secondUploadAt),
      required: true,
      note: 'Factory auto-runs this once the goog_ key is present after first upload.',
    });
  }

  checklist.push({
    id: 'closed_testing_14d',
    title: '14-day closed testing with ≥12 testers (Personal accounts)',
    done:
      testing?.statusState === 'COMPLETED' ||
      testing?.statusState === 'READY_FOR_PROMOTION' ||
      app.status === 'Published' ||
      Boolean(app.playProduction),
    required: true,
    note: `Day ${testing?.currentDay || 0}/${testing?.totalDays || 14} · ${
      app.playProduction ? 'Play production' : testing?.uploaded ? 'uploaded' : 'not uploaded yet'
    }`,
  });

  checklist.push({
    id: 'promote_production',
    title: 'Promote alpha → production',
    done: app.status === 'Published' || Boolean(life.promotedAt) || Boolean(app.playProduction),
    required: true,
    note: 'Use Tester card “Promote to Production” after the 14-day window.',
  });

  // Resolve phase
  let phase = life.phase || 'not_started';
  if (!aabUploaded && !life.firstUploadAt) phase = 'not_started';
  else if (usage.usesRevenueCat && !life.secondUploadAt) {
    phase = rc.ready ? 'ready_for_second_upload' : 'awaiting_revenuecat_setup';
  } else if (life.secondUploadAt || (!usage.usesRevenueCat && aabUploaded)) {
    if (testing?.statusState === 'COMPLETED') phase = 'production';
    else if (testing?.statusState === 'READY_FOR_PROMOTION') phase = 'ready_to_promote';
    else phase = 'closed_testing';
  }

  const nextAction =
    phase === 'not_started'
      ? 'first_upload'
      : phase === 'ready_for_second_upload'
        ? 'second_upload'
        : phase === 'awaiting_revenuecat_setup'
          ? 'wait_revenuecat'
          : phase === 'ready_to_promote'
            ? 'promote_production'
            : 'none';

  const pendingManual = checklist.filter((c) => c.required && !c.done && c.manual);

  return {
    appId: app.id,
    packageName: app.packageName,
    usesAdMob: usage.usesAdMob,
    usesRevenueCat: usage.usesRevenueCat,
    phase,
    nextAction,
    revenueCat: rc,
    firstUploadAt: life.firstUploadAt,
    secondUploadAt: life.secondUploadAt,
    checklist,
    pendingManual,
    summary:
      nextAction === 'first_upload'
        ? 'Needs first Play AAB upload'
        : nextAction === 'wait_revenuecat'
          ? `Waiting on RevenueCat setup (${pendingManual.length} manual step(s)), then second upload`
          : nextAction === 'second_upload'
            ? 'RevenueCat production key ready — queue second AAB upload'
            : nextAction === 'promote_production'
              ? 'Closed testing complete — promote to production'
              : phase === 'closed_testing'
                ? `In closed testing (day ${testing?.currentDay || '?'}/14)`
                : 'No automated release action pending',
  };
}

/**
 * Called after a successful pipeline upload to advance lifecycle phases.
 */
export function advanceLifecycleAfterUpload(app, { mode } = {}) {
  const usage = detectMonetizationUsage(app.sourcePath);
  if (mode === 'first_upload' || mode === 'full') {
    const life = markFirstUploadComplete(app.id, { mode });
    if (!usage.usesRevenueCat) {
      return saveReleaseLifecycle(app.id, { phase: 'closed_testing' });
    }
    const rc = getRevenueCatAndroidKeyStatus(app.sourcePath);
    if (rc.ready) {
      return markRevenueCatReady(app.id);
    }
    return life;
  }
  if (mode === 'second_upload') {
    return markSecondUploadComplete(app.id, { mode });
  }
  if (mode === 'update') {
    // Keep phase; optional note
    return saveReleaseLifecycle(app.id, {
      lastUpdateUploadAt: new Date().toISOString(),
    });
  }
  return loadReleaseLifecycle(app.id);
}
