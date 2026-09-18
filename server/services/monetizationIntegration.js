import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { getMonetizationConfig } from './monetization.js';

const SERVICE_ACCOUNT_PATH =
  process.env.PLAY_CONSOLE_KEY_PATH || path.join(process.cwd(), 'service-account.json');
const MONETIZATION_FILE = path.resolve(process.cwd(), 'data', 'credentials', 'monetization.json');
const GOOGLE_TEST_PUBLISHER = '3940256099942544';
const PLACEHOLDER_RE = /your_|YOUR_|dummy|XXXXXXXX|placeholder|changeme|key_here/i;

const ADMOB_APP_ID_KEYS = [
  'EXPO_PUBLIC_ADMOB_ANDROID_APP_ID',
  'EXPO_PUBLIC_ADMOB_APP_ID',
  'EXPO_PUBLIC_ADMOB_APP_ID_ANDROID',
];
const ADMOB_IOS_APP_ID_KEYS = ['EXPO_PUBLIC_ADMOB_IOS_APP_ID', 'EXPO_PUBLIC_ADMOB_APP_ID_IOS'];

const ADMOB_UNIT_ALIASES = {
  banner: [
    'EXPO_PUBLIC_ADMOB_BANNER_ID',
    'EXPO_PUBLIC_ADMOB_BANNER_ANDROID',
    'EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID',
    'EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID',
  ],
  interstitial: [
    'EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID',
    'EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID',
    'EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID',
    'EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID_ANDROID',
  ],
  rewarded: [
    'EXPO_PUBLIC_ADMOB_REWARDED_ID',
    'EXPO_PUBLIC_ADMOB_REWARDED_ANDROID',
    'EXPO_PUBLIC_ADMOB_REWARDED_ID_ANDROID',
    'REWARDED_AD_UNIT_ID',
  ],
  rewardedInterstitial: [
    'EXPO_PUBLIC_ADMOB_REWARDED_INTERSTITIAL_ID',
    'EXPO_PUBLIC_ADMOB_REWARDED_INTERSTITIAL_ANDROID',
  ],
  native: ['EXPO_PUBLIC_ADMOB_NATIVE_ANDROID', 'EXPO_PUBLIC_ADMOB_NATIVE_ID'],
};

const RC_ANDROID_KEYS = [
  'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID',
  'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
  'EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY',
  'EXPO_PUBLIC_REVENUECAT_API_KEY',
];
const RC_IOS_KEYS = [
  'EXPO_PUBLIC_REVENUECAT_API_KEY_IOS',
  'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
  'EXPO_PUBLIC_REVENUECAT_APPLE_KEY',
];

function classifyId(val) {
  if (val == null || !String(val).trim()) return 'missing';
  const v = String(val).trim().replace(/^['"]|['"]$/g, '');
  if (PLACEHOLDER_RE.test(v)) return 'placeholder';
  if (v.includes(GOOGLE_TEST_PUBLISHER)) return 'test';
  if (/^ca-app-pub-\d+[~/]\d+$/.test(v) || /^goog_/.test(v) || /^appl_/.test(v)) {
    return 'production';
  }
  if (v.length > 8) return 'set';
  return 'missing';
}

function isUsableProduction(val) {
  return classifyId(val) === 'production' || classifyId(val) === 'set';
}

function parseEnvFile(filePath) {
  const map = {};
  const order = [];
  if (!fs.existsSync(filePath)) return { map, order, rawLines: [] };
  const rawLines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of rawLines) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    map[key] = value;
    order.push(key);
  }
  return { map, order, rawLines };
}

function writeEnvUpdates(filePath, updates) {
  const entries = Object.entries(updates).filter(([, v]) => v != null && String(v).trim() !== '');
  if (!entries.length) return { written: 0, keys: [] };

  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const keysWritten = [];

  for (const [key, value] of entries) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      if (content && !content.endsWith('\n')) content += '\n';
      content += `${line}\n`;
    }
    keysWritten.push(key);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  return { written: keysWritten.length, keys: keysWritten };
}

function readPackageDeps(sourcePath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(sourcePath, 'package.json'), 'utf8'));
    return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch {
    return {};
  }
}

export function detectMonetizationUsage(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { usesAdMob: false, usesRevenueCat: false };
  }
  const deps = readPackageDeps(sourcePath);
  return {
    usesAdMob: Boolean(deps['react-native-google-mobile-ads'] || deps['expo-ads-admob']),
    usesRevenueCat: Boolean(deps['react-native-purchases']),
  };
}

function discoverReferencedEnvKeys(sourcePath) {
  const keys = new Set();
  const skip = new Set(['node_modules', '.git', '.expo', 'android', 'ios', 'build', 'dist']);
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    let ents = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      if (ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skip.has(ent.name)) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!/\.(tsx?|jsx?|mjs|cjs|env\.example)$/.test(ent.name) && ent.name !== '.env.example') {
        continue;
      }
      let text = '';
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const matches = text.matchAll(/EXPO_PUBLIC_(?:ADMOB|REVENUECAT)_[A-Z0-9_]+|REWARDED_AD_UNIT_ID/g);
      for (const m of matches) keys.add(m[0]);
    }
  };
  walk(sourcePath);
  // Also include keys already present in .env / .env.example
  for (const name of ['.env', '.env.example']) {
    const { map } = parseEnvFile(path.join(sourcePath, name));
    Object.keys(map).forEach((k) => {
      if (/ADMOB|REVENUECAT|REWARDED_AD_UNIT/i.test(k)) keys.add(k);
    });
  }
  return [...keys];
}

function extractAppJsonAdMobIds(sourcePath) {
  const result = { androidAppId: null, iosAppId: null, file: null };
  for (const file of ['app.json', 'app.config.js', 'app.config.ts']) {
    const fp = path.join(sourcePath, file);
    if (!fs.existsSync(fp)) continue;
    const text = fs.readFileSync(fp, 'utf8');
    const android = text.match(/androidAppId["']?\s*[:=]\s*["'](ca-app-pub-[^"']+)["']/);
    const ios = text.match(/iosAppId["']?\s*[:=]\s*["'](ca-app-pub-[^"']+)["']/);
    if (android || ios) {
      result.file = fp;
      if (android) result.androidAppId = android[1];
      if (ios) result.iosAppId = ios[1];
      if (file === 'app.json') break;
    }
  }
  return result;
}

function updateAppJsonAdMobPlugin(sourcePath, { androidAppId, iosAppId }) {
  const appJsonPath = path.join(sourcePath, 'app.json');
  if (!fs.existsSync(appJsonPath)) return { updated: false, reason: 'no app.json' };
  let json;
  try {
    json = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  } catch {
    return { updated: false, reason: 'invalid app.json' };
  }
  const expo = json.expo || json;
  if (!Array.isArray(expo.plugins)) {
    return { updated: false, reason: 'no plugins array' };
  }

  let changed = false;
  expo.plugins = expo.plugins.map((plugin) => {
    if (plugin === 'react-native-google-mobile-ads') {
      changed = true;
      return [
        'react-native-google-mobile-ads',
        {
          ...(androidAppId ? { androidAppId } : {}),
          ...(iosAppId ? { iosAppId } : {}),
        },
      ];
    }
    if (Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads') {
      const opts = { ...(plugin[1] || {}) };
      if (androidAppId && (!opts.androidAppId || classifyId(opts.androidAppId) !== 'production')) {
        opts.androidAppId = androidAppId;
        changed = true;
      }
      if (iosAppId && (!opts.iosAppId || classifyId(opts.iosAppId) === 'test' || classifyId(opts.iosAppId) === 'placeholder')) {
        opts.iosAppId = iosAppId;
        changed = true;
      }
      return ['react-native-google-mobile-ads', opts];
    }
    return plugin;
  });

  if (!changed) return { updated: false, reason: 'plugin already production or missing' };
  if (json.expo) json.expo = expo;
  else Object.assign(json, expo);
  fs.writeFileSync(appJsonPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  return { updated: true, path: appJsonPath };
}

function pickFirstUsable(values) {
  for (const v of values) {
    if (isUsableProduction(v)) return String(v).trim().replace(/^['"]|['"]$/g, '');
  }
  return null;
}

function collectFromEnvMap(envMap, keys) {
  return pickFirstUsable(keys.map((k) => envMap[k]));
}

function loadAppCredentialRecord(packageName, appId) {
  const config = getMonetizationConfig() || {};
  const apps = config.apps || {};
  return apps[packageName] || apps[appId] || null;
}

function saveAppCredentialRecord(packageName, appId, record) {
  let config = {};
  try {
    config = fs.existsSync(MONETIZATION_FILE)
      ? JSON.parse(fs.readFileSync(MONETIZATION_FILE, 'utf8'))
      : getMonetizationConfig();
  } catch {
    config = getMonetizationConfig();
  }
  if (!config.apps) config.apps = {};
  const key = packageName || appId;
  if (!key) return;
  config.apps[key] = {
    ...(config.apps[key] || {}),
    ...record,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(MONETIZATION_FILE, JSON.stringify(config, null, 2), 'utf8');
}

async function lookupAdMobByPackage(packageName) {
  const config = getMonetizationConfig();
  const publisherId = config?.adMob?.publisherId;
  if (!publisherId || publisherId.includes('000000') || !fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    return null;
  }
  if (!packageName) return null;

  try {
    const credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/admob.readonly',
        'https://www.googleapis.com/auth/admob.report',
      ],
    });
    const admob = google.admob({ version: 'v1', auth });
    const parent = `accounts/${publisherId}`;
    const appsRes = await admob.accounts.apps.list({ parent, pageSize: 1000 });
    const apps = appsRes.data.apps || [];
    const match = apps.find((a) => {
      const linked = a.linkedAppInfo?.appStoreId || a.manualAppInfo?.packageName || '';
      const name = a.manualAppInfo?.displayName || a.linkedAppInfo?.displayName || '';
      return (
        linked === packageName ||
        String(linked).includes(packageName) ||
        String(name).toLowerCase().includes(packageName.split('.').pop())
      );
    });
    if (!match) return { found: false, appsCount: apps.length };

    const appId = match.appId || match.name?.split('/').pop();
    const unitsRes = await admob.accounts.adUnits.list({ parent, pageSize: 2000 });
    const units = (unitsRes.data.adUnits || []).filter((u) => {
      const unitApp = u.appId || '';
      return unitApp === appId || unitApp.endsWith(appId) || u.name?.includes(appId);
    });

    const byFormat = {};
    for (const unit of units) {
      const format = String(unit.adFormat || unit.adTypes?.[0] || '').toUpperCase();
      const id = unit.adUnitId || unit.name?.split('/').pop();
      if (!id) continue;
      if (format.includes('BANNER') && !byFormat.banner) byFormat.banner = id;
      else if (format.includes('INTERSTITIAL') && !format.includes('REWARDED') && !byFormat.interstitial) {
        byFormat.interstitial = id;
      } else if (format.includes('REWARDED') && format.includes('INTERSTITIAL') && !byFormat.rewardedInterstitial) {
        byFormat.rewardedInterstitial = id;
      } else if (format.includes('REWARDED') && !byFormat.rewarded) byFormat.rewarded = id;
      else if (format.includes('NATIVE') && !byFormat.native) byFormat.native = id;
    }

    return {
      found: true,
      androidAppId: appId?.startsWith('ca-app-pub-') ? appId : null,
      adUnits: byFormat,
      displayName: match.manualAppInfo?.displayName || match.linkedAppInfo?.displayName || null,
    };
  } catch (err) {
    console.warn(`[Monetization Integration] AdMob lookup failed: ${err.message}`);
    return { found: false, error: err.message };
  }
}

function buildEnvUpdates({ referencedKeys, envMap, ids, usage }) {
  const updates = {};
  const setIfNeeded = (keys, value) => {
    if (!value || !isUsableProduction(value)) return;
    for (const key of keys) {
      if (!referencedKeys.includes(key) && !(key in envMap)) continue;
      const current = envMap[key];
      const status = classifyId(current);
      if (status === 'missing' || status === 'placeholder' || status === 'test') {
        updates[key] = value;
      }
    }
    // Always ensure at least the primary aliases exist when the SDK is used
    if (keys[0] && !(keys[0] in envMap) && referencedKeys.length === 0) {
      updates[keys[0]] = value;
    }
  };

  if (usage.usesAdMob) {
    setIfNeeded(ADMOB_APP_ID_KEYS, ids.androidAppId);
    setIfNeeded(ADMOB_IOS_APP_ID_KEYS, ids.iosAppId);
    setIfNeeded(ADMOB_UNIT_ALIASES.banner, ids.banner);
    setIfNeeded(ADMOB_UNIT_ALIASES.interstitial, ids.interstitial);
    setIfNeeded(ADMOB_UNIT_ALIASES.rewarded, ids.rewarded);
    setIfNeeded(ADMOB_UNIT_ALIASES.rewardedInterstitial, ids.rewardedInterstitial);
    setIfNeeded(ADMOB_UNIT_ALIASES.native, ids.native);

    // Fill any referenced key we can map by name
    for (const key of referencedKeys) {
      if (!/ADMOB/i.test(key)) continue;
      if (updates[key] || isUsableProduction(envMap[key])) continue;
      const upper = key.toUpperCase();
      if (upper.includes('BANNER') && ids.banner) updates[key] = ids.banner;
      else if (upper.includes('REWARDED') && upper.includes('INTERSTITIAL') && ids.rewardedInterstitial) {
        updates[key] = ids.rewardedInterstitial;
      } else if (upper.includes('INTERSTITIAL') && ids.interstitial) updates[key] = ids.interstitial;
      else if (upper.includes('REWARDED') && ids.rewarded) updates[key] = ids.rewarded;
      else if (upper.includes('NATIVE') && ids.native) updates[key] = ids.native;
      else if (upper.includes('IOS') && upper.includes('APP_ID') && ids.iosAppId) updates[key] = ids.iosAppId;
      else if (upper.includes('APP_ID') && ids.androidAppId) updates[key] = ids.androidAppId;
    }
  }

  if (usage.usesRevenueCat) {
    setIfNeeded(RC_ANDROID_KEYS, ids.revenueCatAndroid);
    setIfNeeded(RC_IOS_KEYS, ids.revenueCatIos);
    for (const key of referencedKeys) {
      if (!/REVENUECAT/i.test(key)) continue;
      if (updates[key] || isUsableProduction(envMap[key])) continue;
      const upper = key.toUpperCase();
      if ((upper.includes('IOS') || upper.includes('APPLE')) && ids.revenueCatIos) {
        updates[key] = ids.revenueCatIos;
      } else if (ids.revenueCatAndroid) {
        updates[key] = ids.revenueCatAndroid;
      }
    }
  }

  return updates;
}

/**
 * First-time upload: wire AdMob + RevenueCat IDs into the RN project when those SDKs are used.
 */
export async function integrateMonetizationIds(app, { force = false } = {}) {
  const sourcePath = app.sourcePath;
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return {
      skipped: true,
      summary: 'No local source path — skipped AdMob/RevenueCat integration',
    };
  }

  const usage = detectMonetizationUsage(sourcePath);
  if (!usage.usesAdMob && !usage.usesRevenueCat) {
    return {
      skipped: true,
      usesAdMob: false,
      usesRevenueCat: false,
      summary: '✔ No AdMob / RevenueCat dependencies detected — nothing to integrate',
    };
  }

  const markerPath = path.resolve(
    process.cwd(),
    'data',
    'apps_content',
    app.id,
    'submission',
    'monetization_integration.json'
  );
  if (!force && fs.existsSync(markerPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      prev.summary = `${prev.summary || 'Monetization IDs integrated'} (preserved on update)`;
      return prev;
    } catch {
      // continue
    }
  }

  console.log(
    `[Monetization Integration] Wiring IDs for ${app.name} (AdMob=${usage.usesAdMob}, RevenueCat=${usage.usesRevenueCat})`
  );

  const envPath = path.join(sourcePath, '.env');
  const { map: envMap } = parseEnvFile(envPath);
  const referencedKeys = discoverReferencedEnvKeys(sourcePath);
  const appJsonIds = extractAppJsonAdMobIds(sourcePath);
  const stored = loadAppCredentialRecord(app.packageName, app.id) || {};

  // Resolve best known IDs from project → stored credentials → AdMob API
  let androidAppId = pickFirstUsable([
    collectFromEnvMap(envMap, ADMOB_APP_ID_KEYS),
    appJsonIds.androidAppId,
    stored.admob?.androidAppId,
  ]);
  let iosAppId = pickFirstUsable([
    collectFromEnvMap(envMap, ADMOB_IOS_APP_ID_KEYS),
    appJsonIds.iosAppId,
    stored.admob?.iosAppId,
  ]);
  let banner = pickFirstUsable([
    collectFromEnvMap(envMap, ADMOB_UNIT_ALIASES.banner),
    stored.admob?.banner,
  ]);
  let interstitial = pickFirstUsable([
    collectFromEnvMap(envMap, ADMOB_UNIT_ALIASES.interstitial),
    stored.admob?.interstitial,
  ]);
  let rewarded = pickFirstUsable([
    collectFromEnvMap(envMap, ADMOB_UNIT_ALIASES.rewarded),
    stored.admob?.rewarded,
  ]);
  let rewardedInterstitial = pickFirstUsable([
    collectFromEnvMap(envMap, ADMOB_UNIT_ALIASES.rewardedInterstitial),
    stored.admob?.rewardedInterstitial,
  ]);
  let native = pickFirstUsable([
    collectFromEnvMap(envMap, ADMOB_UNIT_ALIASES.native),
    stored.admob?.native,
  ]);
  let revenueCatAndroid = pickFirstUsable([
    collectFromEnvMap(envMap, RC_ANDROID_KEYS),
    stored.revenueCat?.androidApiKey,
  ]);
  let revenueCatIos = pickFirstUsable([
    collectFromEnvMap(envMap, RC_IOS_KEYS),
    stored.revenueCat?.iosApiKey,
  ]);

  let admobApi = null;
  if (usage.usesAdMob && (!androidAppId || !banner || !interstitial || !rewarded)) {
    admobApi = await lookupAdMobByPackage(app.packageName);
    if (admobApi?.found) {
      androidAppId = androidAppId || admobApi.androidAppId;
      banner = banner || admobApi.adUnits?.banner;
      interstitial = interstitial || admobApi.adUnits?.interstitial;
      rewarded = rewarded || admobApi.adUnits?.rewarded;
      rewardedInterstitial = rewardedInterstitial || admobApi.adUnits?.rewardedInterstitial;
      native = native || admobApi.adUnits?.native;
    }
  }

  const ids = {
    androidAppId,
    iosAppId,
    banner,
    interstitial,
    rewarded,
    rewardedInterstitial,
    native,
    revenueCatAndroid,
    revenueCatIos,
  };

  const envUpdates = buildEnvUpdates({ referencedKeys, envMap, ids, usage });
  // If project uses AdMob but has no referenced keys and empty .env, seed the common set
  if (usage.usesAdMob && Object.keys(envUpdates).length === 0 && referencedKeys.filter((k) => /ADMOB/i.test(k)).length === 0) {
    if (androidAppId) envUpdates.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID = androidAppId;
    if (banner) envUpdates.EXPO_PUBLIC_ADMOB_BANNER_ID = banner;
    if (interstitial) envUpdates.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID = interstitial;
    if (rewarded) envUpdates.EXPO_PUBLIC_ADMOB_REWARDED_ID = rewarded;
  }
  if (usage.usesRevenueCat && !Object.keys(envUpdates).some((k) => /REVENUECAT/i.test(k))) {
    if (revenueCatAndroid && !isUsableProduction(envMap.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY) && !isUsableProduction(envMap.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID)) {
      envUpdates.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID = revenueCatAndroid;
    }
  }

  const envWrite = writeEnvUpdates(envPath, envUpdates);
  const pluginUpdate = usage.usesAdMob
    ? updateAppJsonAdMobPlugin(sourcePath, { androidAppId, iosAppId })
    : { updated: false };

  // Persist discovered production IDs back into factory credentials (no secrets logged)
  saveAppCredentialRecord(app.packageName, app.id, {
    packageName: app.packageName,
    appName: app.name,
    admob: usage.usesAdMob
      ? {
          androidAppId: androidAppId || null,
          iosAppId: iosAppId || null,
          banner: banner || null,
          interstitial: interstitial || null,
          rewarded: rewarded || null,
          rewardedInterstitial: rewardedInterstitial || null,
          native: native || null,
        }
      : stored.admob || undefined,
    revenueCat: usage.usesRevenueCat
      ? {
          androidApiKey: revenueCatAndroid || null,
          iosApiKey: revenueCatIos || null,
        }
      : stored.revenueCat || undefined,
  });

  const missing = [];
  if (usage.usesAdMob) {
    if (!androidAppId) missing.push('AdMob androidAppId');
    if (!banner && !interstitial && !rewarded) missing.push('AdMob ad units');
  }
  if (usage.usesRevenueCat && !revenueCatAndroid) missing.push('RevenueCat Android API key');

  const parts = [];
  if (usage.usesAdMob) {
    parts.push(
      pluginUpdate.updated || envWrite.keys.some((k) => /ADMOB/i.test(k))
        ? 'AdMob IDs wired'
        : androidAppId
          ? 'AdMob IDs verified'
          : 'AdMob IDs incomplete'
    );
  }
  if (usage.usesRevenueCat) {
    parts.push(revenueCatAndroid ? 'RevenueCat key verified' : 'RevenueCat key missing');
  }

  const result = {
    skipped: false,
    usesAdMob: usage.usesAdMob,
    usesRevenueCat: usage.usesRevenueCat,
    envKeysUpdated: envWrite.keys,
    appJsonUpdated: Boolean(pluginUpdate.updated),
    admobApiLookup: admobApi?.found ? 'matched' : admobApi?.error ? 'error' : admobApi ? 'no-match' : 'skipped',
    hasAndroidAppId: Boolean(androidAppId),
    hasBanner: Boolean(banner),
    hasInterstitial: Boolean(interstitial),
    hasRewarded: Boolean(rewarded),
    hasRevenueCatAndroid: Boolean(revenueCatAndroid),
    missing,
    timestamp: new Date().toISOString(),
    summary:
      missing.length === 0
        ? `✔ ${parts.join(' · ')} (${envWrite.written} env keys, app.json ${pluginUpdate.updated ? 'updated' : 'ok'})`
        : `⚠️ ${parts.join(' · ')} · missing: ${missing.join(', ')}`,
  };

  const dir = path.dirname(markerPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(result, null, 2), 'utf8');
  return result;
}
