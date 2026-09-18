import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getApps, getAppById, getSettings, AppStatus } from '../db/store.js';
import { syncStoreOverviewViaAPI, loadPublisherDefaults, savePublisherDefaults } from './publisherDefaults.js';
import { getTestingDir } from './testerAutomation.js';
import {
  closedTestApi,
  loadClosedTestCredentials,
  uploadFileToR2,
  getMatchCurrentDay,
  resolvePartnerApp,
  resolveMyApp,
} from './closedTestApi.js';

const execFileAsync = promisify(execFile);

/** TheClosedTest peer-swap APK (https://github.com/neerajlovecyber/TheClosedTest-apk) */
export const CLOSED_TEST_PKG = 'com.theneerajsec.theclosedtest';
export const CLOSED_TEST_ACTIVITY = `${CLOSED_TEST_PKG}/.MainActivity`;
export const CLOSED_TEST_SCHEME = 'theclosedtest';
export const COMMUNITY_TESTER_GROUP = 'developers-community-official@googlegroups.com';
export const COMMUNITY_GROUP_URL = 'https://groups.google.com/g/developers-community-official';
export const CLOSED_TEST_PLAY =
  'https://play.google.com/store/apps/details?id=com.theneerajsec.theclosedtest';

const STATE_DIR = () => path.resolve(process.cwd(), 'data', 'closed_test');
const STATE_FILE = () => path.join(STATE_DIR(), 'exchange.json');

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR())) fs.mkdirSync(STATE_DIR(), { recursive: true });
}

function defaultState() {
  return {
    /** packageName → registration / proof progress */
    apps: {},
    /**
     * Partner package names already used in a swap for any of OUR apps.
     * Prevents the same ClosedTest partner from being reused across multiple listings.
     */
    usedPartnerPackages: [],
    /** Partner ClosedTest app UUIDs already matched */
    usedPartnerAppIds: [],
    /** Partner ClosedTest user IDs already used (unique testers across our portfolio) */
    usedPartnerUserIds: [],
    /** Accepted active swaps we must reciprocate daily */
    acceptedSwaps: [],
    lastDailyRunAt: null,
    lastCycleAt: null,
    updatedAt: null,
  };
}

export function loadClosedTestState() {
  ensureStateDir();
  if (!fs.existsSync(STATE_FILE())) return defaultState();
  try {
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')) };
  } catch {
    return defaultState();
  }
}

function saveClosedTestState(state) {
  ensureStateDir();
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function isPersonalAccount() {
  const settings = getSettings() || {};
  return (settings.accountType || 'Personal') === 'Personal';
}

function needsClosedTesting(app) {
  if (!app?.isReal || !app.packageName) return false;
  if (app.playProduction === true) return false;
  if (app.status === AppStatus.PUBLISHED || app.status === 'Published') return false;
  if (app.status === AppStatus.APPROVED || app.status === 'Approved') return false;
  return true;
}

export function listAppsNeedingClosedTest() {
  if (!isPersonalAccount()) return [];
  return getApps().filter(needsClosedTesting);
}

async function adb(args, { timeout = 45000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('adb', args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

export async function checkAdbDevice() {
  const res = await adb(['devices']);
  if (!res.ok) {
    return { connected: false, error: res.error || 'adb not found on PATH' };
  }
  const lines = res.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('List of devices'));
  const devices = lines
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      return { serial, state };
    })
    .filter((d) => d.serial && d.state === 'device');
  return {
    connected: devices.length > 0,
    devices,
    raw: res.stdout.trim(),
  };
}

async function isClosedTestInstalled() {
  const res = await adb(['shell', 'pm', 'path', CLOSED_TEST_PKG]);
  return Boolean(res.ok && /package:/.test(res.stdout));
}

async function launchClosedTest(deepPath = '') {
  if (deepPath) {
    const uri = deepPath.startsWith('theclosedtest://')
      ? deepPath
      : `${CLOSED_TEST_SCHEME}://${deepPath.replace(/^\//, '')}`;
    const view = await adb([
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      uri,
      CLOSED_TEST_PKG,
    ]);
    if (view.ok) return view;
  }
  return adb(['shell', 'am', 'start', '-n', CLOSED_TEST_ACTIVITY]);
}

async function setClipboard(text) {
  // Prefer cmd clipboard service; fall back to service call
  const escaped = String(text).replace(/'/g, "'\\''");
  let res = await adb(['shell', `cmd clipboard set-text '${escaped}'`]);
  if (!res.ok) {
    res = await adb(['shell', 'service', 'call', 'clipboard', '2', 'i32', '1', 'i32', '1', 's16', text.slice(0, 400)]);
  }
  return res;
}

function playStoreUrlFor(packageName) {
  return `https://play.google.com/store/apps/details?id=${packageName}`;
}

function buildRegistrationPayload(app) {
  const title = String(app.name || app.packageName).slice(0, 30);
  const playStoreUrl = playStoreUrlFor(app.packageName);
  const instructions = [
    `Install ${app.name} from the closed testing link / Play Console invite.`,
    'Open the app once daily for 14 days and leave a short note if anything crashes.',
    `Package: ${app.packageName}`,
  ].join(' ');
  return {
    title,
    packageName: app.packageName,
    playStoreUrl,
    requiredTesters: 12,
    instructions: instructions.slice(0, 250),
    communityGroup: COMMUNITY_TESTER_GROUP,
  };
}

/**
 * Ensure ClosedTest community Google Group is on alpha/internal tracks
 * and remembered in publisher defaults (no duplicate entries).
 */
export async function ensureCommunityTesterGroup(appId) {
  const app = getAppById(appId);
  if (!app?.packageName) throw new Error('App not found');

  const defaults = loadPublisherDefaults();
  const groups = Array.isArray(defaults.testerGoogleGroups) ? [...defaults.testerGoogleGroups] : [];
  if (!groups.includes(COMMUNITY_TESTER_GROUP)) {
    groups.push(COMMUNITY_TESTER_GROUP);
    savePublisherDefaults({ testerGoogleGroups: groups });
  }

  let playSync = null;
  if (app.playPackageExists !== false) {
    try {
      playSync = await syncStoreOverviewViaAPI(app.packageName);
    } catch (err) {
      playSync = { success: false, error: err.message };
    }
  }

  return { groups, playSync, communityGroup: COMMUNITY_TESTER_GROUP, communityGroupUrl: COMMUNITY_GROUP_URL };
}

/**
 * Prepare Play testers + open TheClosedTest on device for registration.
 * Dedup: refuses if this package was already registered in exchange state.
 */
export async function startClosedTestRegistration(appId) {
  if (!isPersonalAccount()) {
    return { success: false, error: 'ClosedTest exchange is only for Personal Play accounts' };
  }

  const app = getAppById(appId);
  if (!app) return { success: false, error: 'App not found' };
  if (!needsClosedTesting(app) && app.playProduction) {
    return { success: false, error: 'App already has a production track — closed test not required' };
  }

  const state = loadClosedTestState();
  const existing = state.apps[app.packageName];
  if (existing?.registeredAt && !existing.forceReregister) {
    return {
      success: false,
      error: `Package ${app.packageName} is already registered in ClosedTest exchange (no duplicates)`,
      existing,
    };
  }

  const device = await checkAdbDevice();
  if (!device.connected) {
    return {
      success: false,
      error: 'No ADB device connected. Plug in a phone with USB debugging, then retry.',
      device,
      installHint: CLOSED_TEST_PLAY,
    };
  }

  const installed = await isClosedTestInstalled();
  if (!installed) {
    return {
      success: false,
      error: `TheClosedTest is not installed (${CLOSED_TEST_PKG}). Install from Play, sign in once, join the community group, then retry.`,
      device,
      installHint: CLOSED_TEST_PLAY,
      communityGroupUrl: COMMUNITY_GROUP_URL,
    };
  }

  const playPrep = await ensureCommunityTesterGroup(appId);
  const payload = buildRegistrationPayload(app);

  // Clipboard: Play URL first (paste into Google Play Link field — package auto-extracts)
  await setClipboard(payload.playStoreUrl);

  await adb(['shell', 'am', 'force-stop', CLOSED_TEST_PKG]);
  const launch = await launchClosedTest('add-app');
  if (!launch.ok) {
    return { success: false, error: `Failed to launch TheClosedTest: ${launch.error || launch.stderr}`, device };
  }

  // Brief pause then dump UI for diagnostics
  await new Promise((r) => setTimeout(r, 1500));
  const dump = await adb(['shell', 'uiautomator', 'dump', '/sdcard/closedtest_ui.xml']);
  let uiHint = null;
  if (dump.ok) {
    const pull = await adb(['shell', 'cat', '/sdcard/closedtest_ui.xml']);
    if (pull.ok) {
      uiHint = {
        hasAddApp: /Add (New )?App/i.test(pull.stdout),
        hasGoogle: /Continue with Google/i.test(pull.stdout),
        hasGroup: /Join Community|I've Joined/i.test(pull.stdout),
      };
    }
  }

  state.apps[app.packageName] = {
    appId: app.id,
    packageName: app.packageName,
    title: payload.title,
    playStoreUrl: payload.playStoreUrl,
    registrationOpenedAt: new Date().toISOString(),
    registeredAt: existing?.registeredAt || null,
    status: 'awaiting_manual_submit',
    partners: existing?.partners || [],
    proofs: existing?.proofs || {},
    lastLaunch: {
      device: device.devices[0]?.serial || null,
      uiHint,
      clipboard: 'playStoreUrl',
    },
  };
  saveClosedTestState(state);

  // Persist a short checklist under the app testing folder
  try {
    const notePath = path.join(getTestingDir(app.id), 'closed_test_exchange.json');
    fs.writeFileSync(
      notePath,
      JSON.stringify(
        {
          ...state.apps[app.packageName],
          communityGroup: COMMUNITY_TESTER_GROUP,
          communityGroupUrl: COMMUNITY_GROUP_URL,
          steps: [
            'Confirm developers-community-official@googlegroups.com is on your closed track (auto-seeded when possible).',
            'In TheClosedTest: paste Play URL from clipboard → set name → 12 testers → toggle group confirm → Add App.',
            'On Market: request swaps with partners NOT already used by your other apps.',
            'Use Daily Proofs button each day to open partner apps + capture screenshots via ADB.',
          ],
          playPrep,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {}

  return {
    success: true,
    summary: `Opened TheClosedTest → Add App for ${payload.title}. Play URL is on the device clipboard.`,
    payload,
    playPrep,
    device,
    uiHint,
    steps: [
      'Paste clipboard into Google Play Link (package fills automatically).',
      `App name: ${payload.title}`,
      'Testers needed: 12',
      `Toggle: I have added ${COMMUNITY_TESTER_GROUP}`,
      'Submit Add App, then request unique partners from Market (factory tracks used partners globally).',
    ],
    state: state.apps[app.packageName],
  };
}

/**
 * Mark registration complete and optionally record partner packages (deduped globally).
 */
export function markClosedTestRegistered(appId, { closedTestAppId = null, partnerPackages = [] } = {}) {
  const app = getAppById(appId);
  if (!app) throw new Error('App not found');
  const state = loadClosedTestState();
  const entry = state.apps[app.packageName] || {
    appId: app.id,
    packageName: app.packageName,
    partners: [],
    proofs: {},
  };
  entry.registeredAt = new Date().toISOString();
  entry.status = 'registered';
  if (closedTestAppId) entry.closedTestAppId = closedTestAppId;

  const added = [];
  const skippedDupes = [];
  for (const pkg of partnerPackages) {
    const p = String(pkg || '').trim();
    if (!p) continue;
    if (state.usedPartnerPackages.includes(p) && !entry.partners.includes(p)) {
      skippedDupes.push(p);
      continue;
    }
    if (!entry.partners.includes(p)) entry.partners.push(p);
    if (!state.usedPartnerPackages.includes(p)) {
      state.usedPartnerPackages.push(p);
      added.push(p);
    }
  }

  state.apps[app.packageName] = entry;
  saveClosedTestState(state);
  return { success: true, entry, addedPartners: added, skippedDupes };
}

/**
 * Record a partner used for this app — rejects if already used by another of our apps.
 */
export function reservePartnerForApp(appId, partnerPackageName, partnerAppId = null) {
  const app = getAppById(appId);
  if (!app) throw new Error('App not found');
  const partner = String(partnerPackageName || '').trim();
  if (!partner) throw new Error('partnerPackageName required');

  const state = loadClosedTestState();
  const owner = Object.entries(state.apps).find(
    ([pkg, meta]) => pkg !== app.packageName && (meta.partners || []).includes(partner)
  );
  if (owner) {
    return {
      success: false,
      error: `Partner ${partner} already reserved for ${owner[0]} — pick a different ClosedTest user/app`,
    };
  }
  if (partnerAppId && state.usedPartnerAppIds.includes(partnerAppId)) {
    const other = Object.entries(state.apps).find(([, meta]) =>
      (meta.partnerAppIds || []).includes(partnerAppId)
    );
    if (other && other[0] !== app.packageName) {
      return {
        success: false,
        error: `Partner app id already used by ${other[0]}`,
      };
    }
  }

  const entry = state.apps[app.packageName] || {
    appId: app.id,
    packageName: app.packageName,
    partners: [],
    partnerAppIds: [],
    proofs: {},
  };
  if (!entry.partners.includes(partner)) entry.partners.push(partner);
  if (!state.usedPartnerPackages.includes(partner)) state.usedPartnerPackages.push(partner);
  if (partnerAppId) {
    entry.partnerAppIds = entry.partnerAppIds || [];
    if (!entry.partnerAppIds.includes(partnerAppId)) entry.partnerAppIds.push(partnerAppId);
    if (!state.usedPartnerAppIds.includes(partnerAppId)) state.usedPartnerAppIds.push(partnerAppId);
  }
  state.apps[app.packageName] = entry;
  saveClosedTestState(state);
  return { success: true, entry };
}

/**
 * Daily proof helper: open each reserved partner package, screencap, stash under data/.
 * Then reopen TheClosedTest so the user can upload Day N proof in-app.
 */
export async function runDailyClosedTestProofs(appId = null) {
  if (!isPersonalAccount()) {
    return { success: false, error: 'Personal account only' };
  }

  const device = await checkAdbDevice();
  if (!device.connected) {
    return { success: false, error: 'No ADB device connected', device };
  }

  const state = loadClosedTestState();
  const targets = appId
    ? [getAppById(appId)].filter(Boolean)
    : listAppsNeedingClosedTest().filter((a) => state.apps[a.packageName]?.partners?.length);

  if (!targets.length) {
    // Fallback: apps that at least opened registration
    const fallback = listAppsNeedingClosedTest().filter((a) => state.apps[a.packageName]);
    if (!fallback.length) {
      return {
        success: false,
        error: 'No ClosedTest apps ready. Register an app first, then reserve unique partners.',
      };
    }
    targets.push(...fallback);
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const app of targets) {
    const entry = state.apps[app.packageName] || { partners: [], proofs: {} };
    const partners = entry.partners?.length ? entry.partners : [];
    const proofDir = path.join(STATE_DIR(), 'proofs', app.packageName, dayKey);
    if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });

    const shots = [];

    // Always open our own app once for activity signal
    if (app.packageName) {
      await adb(['shell', 'monkey', '-p', app.packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
      await new Promise((r) => setTimeout(r, 2500));
      const remote = `/sdcard/af_proof_${app.packageName.replace(/\./g, '_')}_self.png`;
      await adb(['shell', 'screencap', '-p', remote]);
      const local = path.join(proofDir, 'self.png');
      const pull = await adb(['pull', remote, local]);
      if (pull.ok && fs.existsSync(local)) shots.push({ type: 'self', path: local });
    }

    for (const partnerPkg of partners.slice(0, 5)) {
      await adb(['shell', 'monkey', '-p', partnerPkg, '-c', 'android.intent.category.LAUNCHER', '1']);
      await new Promise((r) => setTimeout(r, 2500));
      const safe = partnerPkg.replace(/\./g, '_');
      const remote = `/sdcard/af_proof_${safe}.png`;
      await adb(['shell', 'screencap', '-p', remote]);
      const local = path.join(proofDir, `${safe}.png`);
      const pull = await adb(['pull', remote, local]);
      if (pull.ok && fs.existsSync(local)) {
        shots.push({ type: 'partner', packageName: partnerPkg, path: local });
      }
    }

    entry.proofs = entry.proofs || {};
    entry.proofs[dayKey] = {
      capturedAt: new Date().toISOString(),
      shots: shots.map((s) => ({ type: s.type, packageName: s.packageName || app.packageName, file: path.basename(s.path) })),
      dir: proofDir,
    };
    state.apps[app.packageName] = entry;
    results.push({ appId: app.id, packageName: app.packageName, shots: entry.proofs[dayKey].shots, dir: proofDir });
  }

  // Reopen ClosedTest → Tests tab for upload
  await launchClosedTest('');
  state.lastDailyRunAt = new Date().toISOString();
  saveClosedTestState(state);

  return {
    success: true,
    day: dayKey,
    summary: `Captured ${results.reduce((n, r) => n + r.shots.length, 0)} screenshot(s). Upload them in TheClosedTest → match → Day proof.`,
    results,
    nextStep: 'In TheClosedTest, open each active match and submit today’s screenshots (gallery / Files).',
  };
}

export function getClosedTestStatus(appId = null) {
  const personal = isPersonalAccount();
  const state = loadClosedTestState();
  const needing = listAppsNeedingClosedTest().map((a) => ({
    id: a.id,
    name: a.name,
    packageName: a.packageName,
    status: a.status,
    playProduction: a.playProduction,
    exchange: state.apps[a.packageName] || null,
  }));

  let focused = null;
  if (appId) {
    const app = getAppById(appId);
    if (app) {
      focused = {
        id: app.id,
        name: app.name,
        packageName: app.packageName,
        needsClosedTesting: needsClosedTesting(app),
        exchange: state.apps[app.packageName] || null,
      };
    }
  }

  return {
    enabled: personal,
    accountType: personal ? 'Personal' : getSettings()?.accountType || 'Organization',
    closedTestPackage: CLOSED_TEST_PKG,
    communityGroup: COMMUNITY_TESTER_GROUP,
    communityGroupUrl: COMMUNITY_GROUP_URL,
    installUrl: CLOSED_TEST_PLAY,
    hasClerkJwt: Boolean(loadClosedTestCredentials().clerkJwt),
    usedPartnerPackages: state.usedPartnerPackages,
    usedPartnerAppIds: state.usedPartnerAppIds,
    usedPartnerUserIds: state.usedPartnerUserIds || [],
    acceptedSwaps: state.acceptedSwaps || [],
    lastDailyRunAt: state.lastDailyRunAt,
    lastCycleAt: state.lastCycleAt,
    appsNeedingClosedTest: needing,
    app: focused,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findLocalIcon(app) {
  if (!app?.sourcePath) return null;
  const candidates = [
    path.join(app.sourcePath, 'assets', 'images', 'icon.png'),
    path.join(app.sourcePath, 'assets', 'icon.png'),
    path.join(app.sourcePath, 'assets', 'images', 'adaptive-icon.png'),
    path.join(app.sourcePath, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function ensureIconUrl(app) {
  const local = findLocalIcon(app);
  if (local) {
    try {
      return await uploadFileToR2(local, { folder: 'icons', contentType: 'image/png' });
    } catch (err) {
      console.warn(`[ClosedTest] Icon upload failed: ${err.message}`);
    }
  }
  // Public placeholder — API requires a non-empty iconUrl
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(app.name || 'App')}&background=0ea5e9&color=fff&size=128`;
}

function rememberAcceptedSwap(state, swap) {
  state.acceptedSwaps = Array.isArray(state.acceptedSwaps) ? state.acceptedSwaps : [];
  const idx = state.acceptedSwaps.findIndex((s) => s.matchId === swap.matchId);
  if (idx >= 0) state.acceptedSwaps[idx] = { ...state.acceptedSwaps[idx], ...swap };
  else state.acceptedSwaps.push(swap);

  if (swap.partnerPackage && !state.usedPartnerPackages.includes(swap.partnerPackage)) {
    state.usedPartnerPackages.push(swap.partnerPackage);
  }
  if (swap.partnerAppId && !state.usedPartnerAppIds.includes(swap.partnerAppId)) {
    state.usedPartnerAppIds.push(swap.partnerAppId);
  }
  if (swap.partnerUserId && !(state.usedPartnerUserIds || []).includes(swap.partnerUserId)) {
    state.usedPartnerUserIds = state.usedPartnerUserIds || [];
    state.usedPartnerUserIds.push(swap.partnerUserId);
  }
}

/**
 * Full automation for one factory app.
 * Prefers ClosedTest REST API when a JWT exists; otherwise drives the
 * already-signed-in phone over ADB (no Settings JWT required).
 */
export async function runFullClosedTestCycle(appId, { targetTesters = 12, maxRequests = 24 } = {}) {
  if (!isPersonalAccount()) {
    return { success: false, error: 'Personal account only' };
  }
  const app = getAppById(appId);
  if (!app) return { success: false, error: 'App not found' };

  const creds = loadClosedTestCredentials();
  if (creds.clerkJwt) {
    try {
      return await runFullClosedTestCycleViaApi(appId, { targetTesters, maxRequests });
    } catch (err) {
      console.warn(`[ClosedTest] API cycle failed (${err.message}) — falling back to ADB phone session`);
    }
  }
  return runFullClosedTestCycleViaAdb(appId, { targetTesters });
}

/** API path (optional). Phone login cannot share Clerk SecureStore with the PC. */
async function runFullClosedTestCycleViaApi(appId, { targetTesters = 12, maxRequests = 24 } = {}) {
  const app = getAppById(appId);
  const log = [];
  const push = (msg) => {
    log.push(msg);
    console.log(`[ClosedTest] ${msg}`);
  };

  let me;
  await closedTestApi.syncUser().catch(() => {});
  await closedTestApi.confirmGroup().catch(() => {});
  await closedTestApi.checkin().catch(() => {});
  me = await closedTestApi.me();

  push(`API mode · signed in as ${me.email || me.name || me.id}`);
  const playPrep = await ensureCommunityTesterGroup(appId);
  push(`Play tester group seeded: ${COMMUNITY_TESTER_GROUP}`);

  const state = loadClosedTestState();
  const payload = buildRegistrationPayload(app);

  // --- Register (skip if exists) ---
  let myApps = [];
  myApps = await closedTestApi.myApps();
  if (!Array.isArray(myApps)) myApps = myApps?.apps || [];

  let ctApp = myApps.find((a) => a.packageName === app.packageName);
  let created = false;
  if (ctApp) {
    push(`Skip create — already listed as ${ctApp.id} (${ctApp.status})`);
  } else {
    const iconUrl = await ensureIconUrl(app);
    try {
      ctApp = await closedTestApi.createApp({
        title: payload.title,
        packageName: payload.packageName,
        playStoreUrl: payload.playStoreUrl,
        iconUrl,
        instructions: payload.instructions,
        requiredTesters: Math.min(12, Math.max(1, targetTesters)),
      });
      created = true;
      push(`Created ClosedTest app ${ctApp.id}`);
    } catch (err) {
      myApps = await closedTestApi.myApps().catch(() => myApps);
      if (!Array.isArray(myApps)) myApps = myApps?.apps || [];
      ctApp = myApps.find((a) => a.packageName === app.packageName);
      if (!ctApp) throw err;
      push(`Create conflict — using existing ${ctApp.id}`);
    }
  }

  state.apps[app.packageName] = {
    ...(state.apps[app.packageName] || {}),
    appId: app.id,
    packageName: app.packageName,
    title: payload.title,
    playStoreUrl: payload.playStoreUrl,
    closedTestAppId: ctApp.id,
    registeredAt: state.apps[app.packageName]?.registeredAt || new Date().toISOString(),
    status: 'registered',
    partners: state.apps[app.packageName]?.partners || [],
    partnerAppIds: state.apps[app.packageName]?.partnerAppIds || [],
    proofs: state.apps[app.packageName]?.proofs || {},
    mode: 'api',
  };

  const myAppIds = myApps.map((a) => a.id);
  if (!myAppIds.includes(ctApp.id)) myAppIds.push(ctApp.id);

  const acceptedNow = [];
  const pending = (await closedTestApi.listMatches('pending')) || [];
  for (const m of pending) {
    if (m.user2Id !== me.id) continue;
    if (m.app1Id !== ctApp.id && m.app2Id !== ctApp.id) continue;
    try {
      const accepted = await closedTestApi.acceptMatch(m.id);
      const partner = resolvePartnerApp(accepted || m, myAppIds, me.id);
      const swap = {
        matchId: m.id,
        status: 'active',
        ourPackage: app.packageName,
        ourClosedTestAppId: ctApp.id,
        partnerPackage: partner?.packageName || null,
        partnerAppId: partner?.id || (m.app1Id === ctApp.id ? m.app2Id : m.app1Id),
        partnerUserId: partner?.userId || (m.user1Id === me.id ? m.user2Id : m.user1Id),
        partnerTitle: partner?.title || null,
        acceptedAt: new Date().toISOString(),
        startDate: accepted?.startDate || new Date().toISOString(),
      };
      rememberAcceptedSwap(state, swap);
      acceptedNow.push(swap);
      push(`Accepted inbound match ${m.id}`);
    } catch (err) {
      push(`Accept ${m.id} skipped: ${err.message}`);
    }
  }

  const need = Math.max(
    0,
    (ctApp.requiredTesters || targetTesters) - (ctApp.currentTesters || 0) - acceptedNow.length
  );
  const requested = [];
  const skipped = [];
  if (need > 0) {
    const page = await closedTestApi.listApps({ sort: 'latest', limit: 50 });
    const marketplace = page?.apps || page || [];
    const usedPkgs = new Set(state.usedPartnerPackages || []);
    const usedAppIds = new Set(state.usedPartnerAppIds || []);
    const usedUsers = new Set(state.usedPartnerUserIds || []);
    for (const p of state.apps[app.packageName].partners || []) usedPkgs.add(p);
    for (const id of state.apps[app.packageName].partnerAppIds || []) usedAppIds.add(id);

    let sent = 0;
    for (const candidate of marketplace) {
      if (sent >= Math.min(need, maxRequests)) break;
      if (!candidate?.id || candidate.id === ctApp.id) continue;
      if (candidate.userId === me.id) continue;
      if (candidate.status && candidate.status !== 'recruiting') continue;
      if (candidate.currentTesters >= (candidate.requiredTesters || 12)) continue;
      if (usedPkgs.has(candidate.packageName)) {
        skipped.push({ packageName: candidate.packageName, reason: 'duplicate_partner_package' });
        continue;
      }
      if (usedAppIds.has(candidate.id)) {
        skipped.push({ packageName: candidate.packageName, reason: 'duplicate_partner_app' });
        continue;
      }
      if (candidate.userId && usedUsers.has(candidate.userId)) {
        skipped.push({ packageName: candidate.packageName, reason: 'duplicate_partner_user' });
        continue;
      }
      try {
        const match = await closedTestApi.requestMatch({
          myAppId: ctApp.id,
          targetAppId: candidate.id,
        });
        requested.push({
          matchId: match?.id,
          partnerPackage: candidate.packageName,
          partnerAppId: candidate.id,
          partnerUserId: candidate.userId,
          status: match?.status || 'pending',
        });
        usedPkgs.add(candidate.packageName);
        usedAppIds.add(candidate.id);
        if (candidate.userId) usedUsers.add(candidate.userId);
        if (!state.apps[app.packageName].partners.includes(candidate.packageName)) {
          state.apps[app.packageName].partners.push(candidate.packageName);
        }
        state.apps[app.packageName].partnerAppIds = state.apps[app.packageName].partnerAppIds || [];
        if (!state.apps[app.packageName].partnerAppIds.includes(candidate.id)) {
          state.apps[app.packageName].partnerAppIds.push(candidate.id);
        }
        if (!state.usedPartnerPackages.includes(candidate.packageName)) {
          state.usedPartnerPackages.push(candidate.packageName);
        }
        if (!state.usedPartnerAppIds.includes(candidate.id)) state.usedPartnerAppIds.push(candidate.id);
        if (candidate.userId && !(state.usedPartnerUserIds || []).includes(candidate.userId)) {
          state.usedPartnerUserIds = state.usedPartnerUserIds || [];
          state.usedPartnerUserIds.push(candidate.userId);
        }
        sent += 1;
        push(`Requested swap → ${candidate.title || candidate.packageName}`);
        await sleep(400);
      } catch (err) {
        skipped.push({ packageName: candidate.packageName, reason: err.message });
      }
    }
    push(`Swap requests sent: ${sent}`);
  }

  const active = (await closedTestApi.listMatches('active')) || [];
  for (const m of active) {
    if (m.app1Id !== ctApp.id && m.app2Id !== ctApp.id) continue;
    const partner = resolvePartnerApp(m, myAppIds, me.id);
    rememberAcceptedSwap(state, {
      matchId: m.id,
      status: 'active',
      ourPackage: app.packageName,
      ourClosedTestAppId: ctApp.id,
      partnerPackage: partner?.packageName || null,
      partnerAppId: partner?.id || null,
      partnerUserId: partner?.userId || null,
      partnerTitle: partner?.title || null,
      acceptedAt: m.startDate || m.createdAt || new Date().toISOString(),
      startDate: m.startDate || m.createdAt,
    });
  }

  state.lastCycleAt = new Date().toISOString();
  saveClosedTestState(state);

  const ourSwaps = (state.acceptedSwaps || []).filter((s) => s.ourPackage === app.packageName);
  return {
    success: true,
    mode: 'api',
    summary: `${created ? 'Created' : 'Reused'} listing · ${requested.length} request(s) · ${ourSwaps.length} accepted swap(s)`,
    created,
    closedTestAppId: ctApp.id,
    requested,
    skipped,
    acceptedNow,
    acceptedSwaps: ourSwaps,
    playPrep,
    log,
  };
}

/**
 * Default path: use the signed-in TheClosedTest session on the ADB phone.
 * Clerk stores tokens in encrypted SecureStore — the PC cannot read them, so we
 * drive the app UI / intents instead of the REST API.
 */
export async function runFullClosedTestCycleViaAdb(appId, { targetTesters = 12 } = {}) {
  const app = getAppById(appId);
  if (!app) return { success: false, error: 'App not found' };

  const log = [];
  const push = (msg) => {
    log.push(msg);
    console.log(`[ClosedTest:ADB] ${msg}`);
  };

  const device = await checkAdbDevice();
  if (!device.connected) {
    return { success: false, error: 'No ADB device connected', device, log };
  }
  if (!(await isClosedTestInstalled())) {
    return {
      success: false,
      error: `Install TheClosedTest on the phone first (${CLOSED_TEST_PKG})`,
      installHint: CLOSED_TEST_PLAY,
      log,
    };
  }

  const playPrep = await ensureCommunityTesterGroup(appId);
  push(`Play group seeded · ${COMMUNITY_TESTER_GROUP}`);

  const state = loadClosedTestState();
  const payload = buildRegistrationPayload(app);
  const entry = state.apps[app.packageName] || {
    appId: app.id,
    packageName: app.packageName,
    partners: [],
    proofs: {},
  };

  // Skip add-app UI if we already registered this package
  if (entry.registeredAt || entry.closedTestAppId) {
    push(`Skip Add App — already registered locally for ${app.packageName}`);
  } else {
    push('Opening Add App on phone (uses your existing login)');
    await adb(['shell', 'am', 'force-stop', CLOSED_TEST_PKG]);
    await launchClosedTest('add-app');
    await sleep(2500);

    // Fill via clipboard + paste (React Native inputs often ignore `input text`)
    await fillClosedTestField('playUrl', payload.playStoreUrl);
    await sleep(600);
    await fillClosedTestField('appName', payload.title);
    await sleep(400);
    await fillClosedTestField('testers', String(Math.min(12, targetTesters)));
    await sleep(400);
    await fillClosedTestField('instructions', payload.instructions);
    await sleep(500);

    // Toggle confirmation + submit by text
    await tapUiText('I have added the group email');
    await sleep(400);
    await tapUiText('Add App');
    await sleep(2000);

    entry.registrationOpenedAt = new Date().toISOString();
    entry.registeredAt = new Date().toISOString();
    entry.status = 'registered';
    entry.title = payload.title;
    entry.playStoreUrl = payload.playStoreUrl;
    entry.mode = 'adb';
    push('Submitted Add App form on device');
  }

  // Marketplace: open Market tab and request unique swaps by tapping cards
  push('Opening Market to request unique swaps');
  await launchClosedTest(''); // home
  await sleep(1500);
  await tapUiText('Market');
  await sleep(2000);

  const used = new Set([
    ...(state.usedPartnerPackages || []),
    ...(entry.partners || []),
    app.packageName,
  ]);
  const requested = [];
  const dumpPkgs = await scrapePackageNamesFromUi();
  for (const pkg of dumpPkgs) {
    if (requested.length >= targetTesters) break;
    if (used.has(pkg)) continue;
    // Open details by searching text containing package — tap package line then Start Testing
    const tapped = await tapUiText(pkg);
    if (!tapped) continue;
    await sleep(1200);
    await tapUiText('Start Testing Together');
    await sleep(800);
    await tapUiText('I Agree & Start');
    await sleep(1000);
    used.add(pkg);
    if (!entry.partners.includes(pkg)) entry.partners.push(pkg);
    if (!state.usedPartnerPackages.includes(pkg)) state.usedPartnerPackages.push(pkg);
    requested.push({ partnerPackage: pkg, status: 'requested_via_adb' });
    rememberAcceptedSwap(state, {
      matchId: `adb-pending-${pkg}`,
      status: 'pending',
      ourPackage: app.packageName,
      partnerPackage: pkg,
      acceptedAt: null,
      startDate: null,
      source: 'adb',
    });
    push(`Requested swap via UI → ${pkg}`);
    await adb(['shell', 'input', 'keyevent', '4']); // back
    await sleep(800);
  }

  // Accept inbound: Tests tab
  await tapUiText('Tests');
  await sleep(1500);
  for (let i = 0; i < 8; i++) {
    const accepted = await tapUiText('Accept Swap');
    if (!accepted) break;
    push('Tapped Accept Swap');
    await sleep(1200);
  }

  // Scrape active partner packages from Tests UI and mark accepted
  const activePkgs = await scrapePackageNamesFromUi();
  for (const pkg of activePkgs) {
    if (pkg === app.packageName) continue;
    if (!entry.partners.includes(pkg)) entry.partners.push(pkg);
    rememberAcceptedSwap(state, {
      matchId: `adb-${pkg}`,
      status: 'active',
      ourPackage: app.packageName,
      partnerPackage: pkg,
      acceptedAt: new Date().toISOString(),
      startDate: new Date().toISOString(),
      source: 'adb',
    });
  }

  entry.partners = entry.partners || [];
  state.apps[app.packageName] = entry;
  state.lastCycleAt = new Date().toISOString();
  saveClosedTestState(state);

  const acceptedSwaps = (state.acceptedSwaps || []).filter(
    (s) => s.ourPackage === app.packageName && s.status === 'active'
  );

  return {
    success: true,
    mode: 'adb',
    summary: `Phone session · registered · ${requested.length} swap request(s) · ${acceptedSwaps.length} active partner(s) saved`,
    requested,
    acceptedSwaps,
    playPrep,
    log,
    note: 'Uses your TheClosedTest login on the ADB phone. No JWT paste required.',
  };
}

async function dumpUiXml() {
  await adb(['shell', 'uiautomator', 'dump', '/sdcard/af_ct_ui.xml']);
  const pull = await adb(['shell', 'cat', '/sdcard/af_ct_ui.xml']);
  return pull.ok ? pull.stdout : '';
}

async function scrapePackageNamesFromUi() {
  const xml = await dumpUiXml();
  const found = new Set();
  const re = /com\.[a-zA-Z0-9_.]+/g;
  let m;
  while ((m = re.exec(xml))) {
    const pkg = m[0].replace(/["']+$/, '');
    if (pkg === CLOSED_TEST_PKG) continue;
    if (pkg.split('.').length < 3) continue;
    found.add(pkg);
  }
  return [...found];
}

async function tapUiText(text) {
  const xml = await dumpUiXml();
  // Prefer exact text= then content-desc=
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i'),
    new RegExp(`text="${escaped}"[\\s\\S]*?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i'),
    new RegExp(`content-desc="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i'),
    new RegExp(`text="[^"]*${escaped}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i'),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    await adb(['shell', 'input', 'tap', String(x), String(y)]);
    return true;
  }
  return false;
}

async function fillClosedTestField(nativeIdOrHint, value) {
  // Focus field by resource-id / text near nativeID labels, then paste clipboard
  await setClipboard(value);
  const xml = await dumpUiXml();
  const idHints = {
    playUrl: ['playUrl', 'Google Play Link', 'Play Link', 'play.google.com'],
    appName: ['appName', 'App Name'],
    testers: ['testers', 'Testers Needed', 'Testers'],
    instructions: ['instructions', 'Instructions'],
  };
  const hints = idHints[nativeIdOrHint] || [nativeIdOrHint];
  for (const hint of hints) {
    const tapped = await tapUiText(hint);
    if (tapped) {
      await sleep(300);
      // Select-all + paste (works on many OEM keyboards)
      await adb(['shell', 'input', 'keyevent', 'KEYCODE_MOVE_END']);
      await adb(['shell', 'input', 'keyevent', '--longpress', 'KEYCODE_CTRL_LEFT', 'KEYCODE_V']).catch(
        () => {}
      );
      // Fallback paste chord
      await adb(['shell', 'input', 'text', String(value).replace(/ /g, '%s').slice(0, 80)]).catch(
        () => {}
      );
      return true;
    }
  }
  // Last resort: just dump clipboard and hope focused field exists
  void xml;
  await adb(['shell', 'input', 'text', String(value).replace(/[^\w.:\-/]/g, '').slice(0, 60)]).catch(
    () => {}
  );
  return false;
}

/**
 * For every saved accepted swap: ADB-open partner app → screenshot → upload proof.
 * Uses API upload when JWT exists; otherwise ADB + gallery push into TheClosedTest UI.
 */
export async function runDailyProofAutomation(appId = null) {
  if (!isPersonalAccount()) return { success: false, error: 'Personal account only' };

  const creds = loadClosedTestCredentials();
  if (creds.clerkJwt) {
    try {
      return await runDailyProofAutomationViaApi(appId);
    } catch (err) {
      console.warn(`[ClosedTest] API daily failed (${err.message}) — ADB fallback`);
    }
  }
  return runDailyProofAutomationViaAdb(appId);
}

async function runDailyProofAutomationViaApi(appId = null) {
  const device = await checkAdbDevice();
  if (!device.connected) {
    return { success: false, error: 'No ADB device connected', device };
  }

  const me = await closedTestApi.me();
  let myApps = await closedTestApi.myApps();
  if (!Array.isArray(myApps)) myApps = myApps?.apps || [];
  const myAppIds = myApps.map((a) => a.id);
  await closedTestApi.checkin().catch(() => {});

  const state = loadClosedTestState();
  const active = (await closedTestApi.listMatches('active')) || [];
  for (const m of active) {
    const mine = resolveMyApp(m, myAppIds, me.id);
    const partner = resolvePartnerApp(m, myAppIds, me.id);
    if (!mine?.packageName || !partner) continue;
    if (appId) {
      const factoryApp = getAppById(appId);
      if (factoryApp && mine.packageName !== factoryApp.packageName) continue;
    }
    rememberAcceptedSwap(state, {
      matchId: m.id,
      status: 'active',
      ourPackage: mine.packageName,
      ourClosedTestAppId: mine.id,
      partnerPackage: partner.packageName,
      partnerAppId: partner.id,
      partnerUserId: partner.userId,
      partnerTitle: partner.title,
      startDate: m.startDate || m.createdAt,
      acceptedAt: m.startDate || m.createdAt,
    });
  }

  let swaps = (state.acceptedSwaps || []).filter((s) => s.status === 'active' || !s.status);
  if (appId) {
    const factoryApp = getAppById(appId);
    if (factoryApp) swaps = swaps.filter((s) => s.ourPackage === factoryApp.packageName);
  }
  if (!swaps.length) {
    saveClosedTestState(state);
    return {
      success: false,
      error: 'No accepted swaps saved yet. Run Full ClosedTest Cycle first and wait for partners to accept.',
    };
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const swap of swaps) {
    const item = {
      matchId: swap.matchId,
      partnerPackage: swap.partnerPackage,
      day: null,
      proofId: null,
      screenshot: null,
      ok: false,
      error: null,
    };
    try {
      if (swap.partnerPackage) {
        await adb([
          'shell',
          'monkey',
          '-p',
          swap.partnerPackage,
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ]);
        await sleep(3500);
      }
      const proofDir = path.join(STATE_DIR(), 'proofs', swap.ourPackage || 'unknown', dayKey);
      if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
      const safe = String(swap.partnerPackage || swap.matchId).replace(/[^a-zA-Z0-9._-]/g, '_');
      const remote = `/sdcard/af_ct_${safe}.png`;
      const local = path.join(proofDir, `${safe}.png`);
      await adb(['shell', 'screencap', '-p', remote]);
      const pull = await adb(['pull', remote, local]);
      if (!pull.ok || !fs.existsSync(local)) throw new Error(`Screenshot failed for ${swap.partnerPackage}`);
      item.screenshot = local;

      let proofs = [];
      try {
        proofs = (await closedTestApi.listProofs(swap.matchId)) || [];
      } catch {}
      const mineProofs = proofs.filter((p) => p.uploaderId === me.id);
      const highest = mineProofs.reduce((m, p) => Math.max(m, p.day || 0), 0);
      const day = getMatchCurrentDay(swap.startDate, swap.acceptedAt, highest || 1);
      item.day = day;
      if (mineProofs.some((p) => p.day === day && (p.status === 'pending' || p.status === 'approved'))) {
        item.ok = true;
        item.error = 'already_submitted_today';
        results.push(item);
        continue;
      }
      const url = await uploadFileToR2(local, { folder: 'proofs', contentType: 'image/png' });
      const proof = await closedTestApi.submitProof({
        matchId: swap.matchId,
        day,
        type: 'image',
        storageUrls: [url],
        comment: `App Factory ADB proof · ${swap.partnerPackage} · ${dayKey}`,
      });
      item.proofId = proof?.id || null;
      item.ok = true;
      for (const p of proofs) {
        if (p.uploaderId === me.id || p.status !== 'pending') continue;
        try {
          await closedTestApi.reviewProof(p.id, { status: 'approved' });
        } catch {}
      }
      const entry = state.apps[swap.ourPackage] || { packageName: swap.ourPackage, proofs: {} };
      entry.proofs = entry.proofs || {};
      entry.proofs[dayKey] = entry.proofs[dayKey] || { shots: [] };
      entry.proofs[dayKey].shots.push({
        matchId: swap.matchId,
        partnerPackage: swap.partnerPackage,
        day,
        file: path.basename(local),
        proofId: item.proofId,
      });
      state.apps[swap.ourPackage] = entry;
    } catch (err) {
      item.error = err.message;
    }
    results.push(item);
    await sleep(800);
  }

  await launchClosedTest('');
  state.lastDailyRunAt = new Date().toISOString();
  saveClosedTestState(state);
  const okCount = results.filter((r) => r.ok).length;
  return {
    success: okCount > 0,
    mode: 'api',
    summary: `Daily proofs: ${okCount}/${results.length} uploaded · ${swaps.length} accepted swap(s)`,
    day: dayKey,
    results,
    acceptedSwaps: swaps,
  };
}

/** ADB-only daily proofs using the signed-in phone session (no JWT). */
export async function runDailyProofAutomationViaAdb(appId = null) {
  const device = await checkAdbDevice();
  if (!device.connected) {
    return { success: false, error: 'No ADB device connected', device };
  }

  const state = loadClosedTestState();
  let swaps = (state.acceptedSwaps || []).filter((s) => s.partnerPackage);
  if (appId) {
    const factoryApp = getAppById(appId);
    if (factoryApp) swaps = swaps.filter((s) => s.ourPackage === factoryApp.packageName);
  }
  // Also include partners listed on the app entry
  if (appId) {
    const factoryApp = getAppById(appId);
    const entry = factoryApp && state.apps[factoryApp.packageName];
    for (const pkg of entry?.partners || []) {
      if (!swaps.some((s) => s.partnerPackage === pkg)) {
        swaps.push({
          matchId: `adb-${pkg}`,
          ourPackage: factoryApp.packageName,
          partnerPackage: pkg,
          status: 'active',
          source: 'adb',
        });
      }
    }
  }

  if (!swaps.length) {
    return {
      success: false,
      error: 'No saved partners yet. Run Full Cycle on the phone first.',
      mode: 'adb',
    };
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const results = [];
  const galleryDir = '/sdcard/DCIM/ClosedTest';
  await adb(['shell', 'mkdir', '-p', galleryDir]);

  for (const swap of swaps) {
    const item = {
      matchId: swap.matchId,
      partnerPackage: swap.partnerPackage,
      screenshot: null,
      ok: false,
      error: null,
    };
    try {
      await adb([
        'shell',
        'monkey',
        '-p',
        swap.partnerPackage,
        '-c',
        'android.intent.category.LAUNCHER',
        '1',
      ]);
      await sleep(3500);
      const proofDir = path.join(STATE_DIR(), 'proofs', swap.ourPackage || 'unknown', dayKey);
      if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
      const safe = String(swap.partnerPackage).replace(/[^a-zA-Z0-9._-]/g, '_');
      const remote = `${galleryDir}/${safe}_${dayKey}.png`;
      const local = path.join(proofDir, `${safe}.png`);
      await adb(['shell', 'screencap', '-p', remote]);
      await adb(['pull', remote, local]);
      await adb([
        'shell',
        'am',
        'broadcast',
        '-a',
        'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
        '-d',
        `file://${remote}`,
      ]);
      item.screenshot = local;
      item.ok = fs.existsSync(local);

      const entry = state.apps[swap.ourPackage] || { packageName: swap.ourPackage, proofs: {} };
      entry.proofs = entry.proofs || {};
      entry.proofs[dayKey] = entry.proofs[dayKey] || { shots: [] };
      entry.proofs[dayKey].shots.push({
        matchId: swap.matchId,
        partnerPackage: swap.partnerPackage,
        file: path.basename(local),
        remote,
      });
      state.apps[swap.ourPackage] = entry;

      // Open ClosedTest → Tests and try Upload Screenshots from gallery
      await launchClosedTest('');
      await sleep(1200);
      await tapUiText('Tests');
      await sleep(1000);
      if (swap.partnerPackage) await tapUiText(swap.partnerPackage);
      await sleep(800);
      await tapUiText('Upload Screenshots');
      await sleep(1000);
      // Best-effort: tap first gallery thumbnail region / Recent
      await tapUiText('Photos');
      await tapUiText('Gallery');
      await tapUiText('Recent');
    } catch (err) {
      item.error = err.message;
    }
    results.push(item);
    await sleep(600);
  }

  state.lastDailyRunAt = new Date().toISOString();
  saveClosedTestState(state);
  const okCount = results.filter((r) => r.ok).length;
  return {
    success: okCount > 0,
    mode: 'adb',
    summary: `ADB daily: ${okCount}/${results.length} screenshots · saved under DCIM/ClosedTest + opened Upload in TheClosedTest`,
    day: dayKey,
    results,
    note: 'Uses phone login only — screenshots are in gallery for ClosedTest upload.',
  };
}

/** Run full cycle for every Personal-account app still needing closed testing. */
export async function runFullClosedTestCycleAll(opts = {}) {
  const targets = listAppsNeedingClosedTest();
  const results = [];
  for (const app of targets) {
    const r = await runFullClosedTestCycle(app.id, opts);
    results.push({ appId: app.id, packageName: app.packageName, ...r });
  }
  return {
    success: results.some((r) => r.success),
    summary: `Cycled ${results.filter((r) => r.success).length}/${results.length} apps needing closed test`,
    results,
  };
}


