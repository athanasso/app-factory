import fs from 'fs';
import path from 'path';
import { fetchLiveAppMetrics, fetchPlayStoreTitle, fetchPlayTrackPresence } from '../services/playConsole.js';
import { getLiveMonetizationMetrics } from '../services/monetization.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const APPS_FILE = path.join(DATA_DIR, 'apps.json');
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || 'D:/Projects/RN/published';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Step & App Statuses
export const StepStatus = {
  COMPLETED: 'completed',
  RUNNING: 'running',
  PENDING: 'pending',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

export const AppStatus = {
  APPROVED: 'Approved',
  IN_REVIEW: 'In Review',
  FAILED: 'Failed',
  CREATED: 'Created',
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  UPDATING: 'Updating',
};

export const createPipelineTemplate = () => [
  {
    id: 'research',
    title: 'RESEARCH & SPEC',
    steps: [
      { id: 'keyword_research', name: 'Keyword Research', subtitle: 'Play Store · ASO · Niche Analysis', status: StepStatus.PENDING, progress: 0 },
      { id: 'product_spec', name: 'Product Spec', subtitle: 'AI-generated specification', status: StepStatus.PENDING, progress: 0 },
      { id: 'competitor_analysis', name: 'Competitor Analysis', subtitle: 'Top 10 apps in niche', status: StepStatus.PENDING, progress: 0 },
    ],
  },
  {
    id: 'development',
    title: 'DEVELOPMENT',
    steps: [
      { id: 'generate_code', name: 'Generate App Code', subtitle: 'React Native / Android codebase', status: StepStatus.PENDING, progress: 0 },
      { id: 'firebase_setup', name: 'Firebase Setup', subtitle: 'Analytics · Crashlytics · Cloud Messaging', status: StepStatus.PENDING, progress: 0 },
      { id: 'admob_integration', name: 'AdMob & RevenueCat', subtitle: 'Wire production AdMob + RC IDs when used', status: StepStatus.PENDING, progress: 0 },
      { id: 'localization', name: 'Localization Top-Up', subtitle: '49 locales · auto-translated', status: StepStatus.PENDING, progress: 0 },
    ],
  },
  {
    id: 'marketing',
    title: 'MARKETING ASSETS',
    steps: [
      { id: 'screenshots', name: 'Screenshots', subtitle: 'Phone: 6 · Tablet: 6 · Chromebook: 4', status: StepStatus.PENDING, progress: 0 },
      { id: 'description', name: 'Description', subtitle: 'Short: 170ch · Full: 3850ch · Notes: 1390ch', status: StepStatus.PENDING, progress: 0 },
      { id: 'translations', name: 'Translations', subtitle: '49 locales · 0 batches', status: StepStatus.PENDING, progress: 0 },
      { id: 'create_version', name: 'Create Version', subtitle: 'Play Console Release Preparation', status: StepStatus.PENDING, progress: 0 },
      { id: 'push_locales', name: 'Push Locales', subtitle: 'AppInfo: 53 · Version: 53 · Builds: 100', status: StepStatus.PENDING, progress: 0 },
      { id: 'whats_new', name: "What's New", subtitle: 'AI Changelog generated', status: StepStatus.PENDING, progress: 0 },
      { id: 'feature_graphic', name: 'Feature Graphic', subtitle: '1024×500 · auto-generated', status: StepStatus.PENDING, progress: 0 },
      { id: 'promo_video', name: 'Promotional Video', subtitle: 'YouTube · optional', status: StepStatus.PENDING, progress: 0 },
    ],
  },
  {
    id: 'pre_submission',
    title: 'PRE-SUBMISSION',
    steps: [
      { id: 'app_icon', name: 'App Icon', subtitle: 'Catalog: True · Build: succeeded', status: StepStatus.PENDING, progress: 0 },
      { id: 'content_rating', name: 'Content Rating', subtitle: 'IARC questionnaire', status: StepStatus.PENDING, progress: 0 },
      { id: 'data_safety', name: 'Data Safety', subtitle: 'Privacy declarations', status: StepStatus.PENDING, progress: 0 },
      { id: 'verify_assets', name: 'Verify Assets', subtitle: 'Audited: 100 · OK: 100 · Fixed: 0', status: StepStatus.PENDING, progress: 0 },
    ],
  },
  {
    id: 'submission',
    title: 'SUBMISSION',
    steps: [
      { id: 'build_aab', name: 'Build & Sign AAB', subtitle: 'Android App Bundle generation', status: StepStatus.PENDING, progress: 0 },
      { id: 'upload_console', name: 'Upload to Play Console', subtitle: 'Google Play Developer API v3', status: StepStatus.PENDING, progress: 0 },
      { id: 'submit_review', name: 'Submit for Review', subtitle: 'Review: PENDING', status: StepStatus.PENDING, progress: 0 },
    ],
  },
  {
    id: 'monitoring',
    title: 'MONITORING',
    steps: [
      { id: 'reviews_monitor', name: 'Reviews Monitor', subtitle: 'Auto-reply enabled', status: StepStatus.PENDING, progress: 0 },
      { id: 'crash_analytics', name: 'Crash Analytics', subtitle: 'Firebase Crashlytics', status: StepStatus.PENDING, progress: 0 },
      { id: 'revenue_tracking', name: 'Revenue Tracking', subtitle: 'AdMob + IAP', status: StepStatus.PENDING, progress: 0 },
      { id: 'update_suggestions', name: 'Update Suggestions', subtitle: 'AI-powered improvements', status: StepStatus.PENDING, progress: 0 },
    ],
  },
];

const allCompleted = (pipeline) =>
  pipeline.map((section) => ({
    ...section,
    steps: section.steps.map((step) => ({ ...step, status: StepStatus.COMPLETED, progress: 100 })),
  }));

// Dynamically extract Play Store category from configs or derive via semantic keyword matching
const getCategory = (appPath, appName, displayName, packageName) => {
  if (appPath) {
    try {
      const appJsonPath = path.join(appPath, 'app.json');
      if (fs.existsSync(appJsonPath)) {
        const data = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
        const cat = data?.expo?.android?.playStoreCategory || data?.expo?.category || data?.expo?.extra?.category || data?.expo?.extra?.playStoreCategory || data?.category;
        if (cat && typeof cat === 'string') return cat;
      }
    } catch (e) {}

    try {
      const pkgPath = path.join(appPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const cat = data?.playStoreCategory || data?.category;
        if (cat && typeof cat === 'string') return cat;
      }
    } catch (e) {}
  }

  try {
    const listingPath = path.join(process.cwd(), 'data', 'apps_content', `real-${appName.toLowerCase()}`, 'locales', 'en-US', 'listing.json');
    if (fs.existsSync(listingPath)) {
      const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
      if (listing?.category) return listing.category;
      if (listing?.seoMetadata?.category) return listing.seoMetadata.category;
      if (listing?.seoMetadata?.nicheSummary) {
        const match = listing.seoMetadata.nicheSummary.match(/\(([A-Z][a-z0-9\s&]+)\)/);
        if (match && match[1]) return match[1];
      }
    }
  } catch (e) {}

  // Semantic topic clustering fallback based on available app metadata
  const text = `${appName} ${displayName || ''} ${packageName || ''}`.toLowerCase();
  if (/game|play|flappy|floppy|derpy|fly|arcade|jump|puzzle|shooter|ball|level/.test(text)) return 'Games';
  if (/fuel|gas|petrol|diesel|pump|fuelgr|fuelgreece/.test(text)) return 'Travel & Local';
  if (/astro|horoscope|zodiac|natal|star sign|astrology|astralogos/.test(text)) return 'Lifestyle';
  if (/transit|bus|metro|train|vehicle|vehiclo|car|auto|gps|map|travel|ride|navigation|flight/.test(text)) return 'Travel & Local';
  if (/calendar|eortologio|date|nameday|holiday|book|dictionary|reference|bible|wiki|encyclopedia/.test(text)) return 'Books & Reference';
  if (/media|video|movie|cinema|stream|player|tv|photo|gallery|camera|wallpaper|audio|music/.test(text)) return 'Media & Video';
  if (/downloader|fetchit|widget|tool|utility|cleaner|file|compress|calculator|qr|barcode|battery|settings/.test(text)) return 'Tools';
  if (/social|chat|message|unfollow|follower|instunfollowers|tweet|community|share/.test(text)) return 'Social';
  if (/news|scroll|doomscroll|reader|rss|feed|magazine|blog/.test(text)) return 'News & Magazines';
  if (/fitness|workout|health|run|gym|cal|steps/.test(text)) return 'Health & Fitness';
  if (/finance|wallet|budget|money|bank|pay|crypto/.test(text)) return 'Finance';
  return 'Productivity';
};

// Dynamically resolve app emoji icon from configs, AI store listings, keywords, or category fallbacks
const getAppIcon = (appPath, appName, displayName, category) => {
  try {
    const appId = `real-${(appName || '').toLowerCase()}`;
    const listingPath = path.join(process.cwd(), 'data', 'apps_content', appId, 'locales', 'en-US', 'listing.json');
    if (fs.existsSync(listingPath)) {
      const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
      const emoji = listing?.emoji || listing?.iconEmoji || listing?.productSpec?.emoji;
      if (emoji && typeof emoji === 'string') return emoji;
    }
  } catch (e) {}

  if (appPath) {
    try {
      const appJsonPath = path.join(appPath, 'app.json');
      if (fs.existsSync(appJsonPath)) {
        const data = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
        const emoji = data?.expo?.extra?.emoji || data?.expo?.extra?.iconEmoji || data?.expo?.iconEmoji || data?.emoji;
        if (emoji && typeof emoji === 'string') return emoji;
      }
    } catch (e) {}

    try {
      const pkgPath = path.join(appPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const emoji = data?.emoji || data?.iconEmoji;
        if (emoji && typeof emoji === 'string') return emoji;
      }
    } catch (e) {}
  }

  // Semantic keyword mapping
  const text = `${appName} ${displayName || ''}`.toLowerCase();
  const keywordMap = [
    { regex: /bird|fly|floppy|flappy|wing|feather|owl|eagle|derpy|disk/, emoji: '🐦' },
    { regex: /car|vehicle|vehiclo|auto|drive|motor|traffic/, emoji: '🚗' },
    { regex: /bus|transit|train|metro|coach|transport/, emoji: '🚌' },
    { regex: /calendar|eortologio|date|event|schedule|planner|holiday/, emoji: '📅' },
    { regex: /scroll|doomscroll|phone|mobile|addict/, emoji: '📱' },
    { regex: /down|download|downloader|fetch|save|torrent|grabber/, emoji: '⬇️' },
    { regex: /sea|ocean|water|galazio|blue|wave|beach|marine|summer/, emoji: '🌊' },
    { regex: /unfollow|follower|social|user|friend|people|inst/, emoji: '👥' },
    { regex: /movie|cinema|film|tracker|watchlist|actor|series|show/, emoji: '🎬' },
    { regex: /auth|login|lock|password|security|crypto|key|protect/, emoji: '🔐' },
    { regex: /photo|gallery|image|picture|widget|album/, emoji: '🖼️' },
    { regex: /camera|shoot|snapshot|selfie|capture|lens/, emoji: '📸' },
    { regex: /video|clip|wallpaper|live|streaming|record/, emoji: '🎥' },
    { regex: /music|song|audio|sound|radio/, emoji: '🎵' },
    { regex: /game|play|arcade|score|controller/, emoji: '🎮' },
    { regex: /fitness|gym|workout|run/, emoji: '🏃' },
    { regex: /money|finance|wallet|budget/, emoji: '💰' }
  ];

  for (const { regex, emoji } of keywordMap) {
    if (regex.test(text)) return emoji;
  }

  // Category-based fallback
  const categoryFallbacks = {
    'Games': '🎮',
    'Travel & Local': '🗺️',
    'Books & Reference': '📚',
    'Media & Video': '🎞️',
    'Tools': '🛠️',
    'Social': '💬',
    'News & Magazines': '📰',
    'Health & Fitness': '❤️',
    'Finance': '💼'
  };

  return categoryFallbacks[category] || '🚀';
};

// Extract actual Android package name from project configs
function extractRealPackage(appPath, fallbackName) {
  try {
    const appJsonPath = path.join(appPath, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const data = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      if (data?.expo?.android?.package) return data.expo.android.package;
    }
  } catch (e) {}

  try {
    const cfgPath = path.join(appPath, 'app.config.js');
    if (fs.existsSync(cfgPath)) {
      const content = fs.readFileSync(cfgPath, 'utf8');
      const match = content.match(/package:\s*['"]([^'"]+)['"]/);
      if (match && match[1]) return match[1];
    }
  } catch (e) {}

  try {
    const manifestPath = path.join(appPath, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf8');
      const match = content.match(/package=["']([^"']+)["']/);
      if (match && match[1]) return match[1];
    }
  } catch (e) {}

  try {
    const gradlePaths = [
      path.join(appPath, 'android', 'app', 'build.gradle'),
      path.join(appPath, 'android', 'app', 'build.gradle.kts')
    ];
    for (const g of gradlePaths) {
      if (fs.existsSync(g)) {
        const content = fs.readFileSync(g, 'utf8');
        const match = content.match(/applicationId\s*[=\s]\s*["']([^"']+)["']/);
        if (match && match[1]) return match[1];
      }
    }
  } catch (e) {}

  return `com.athanasso.${fallbackName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

// Extract human-readable Play Store title dynamically from AI store listing or project configuration (< 30 chars)
function extractDisplayName(appPath, appName) {
  const appId = `real-${appName.toLowerCase()}`;
  let displayName = null;

  try {
    // 1. Prioritize dynamic ASO title generated by the AI copywriting engine in listing.json
    const listingPath = path.join(process.cwd(), 'data', 'apps_content', appId, 'locales', 'en-US', 'listing.json');
    if (fs.existsSync(listingPath)) {
      const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
      if (listing?.title && listing.title.trim()) {
        displayName = listing.title.trim();
      }
    }
  } catch (e) {}

  if (!displayName) {
    try {
      // 2. Fall back to project app.json configuration
      const appJsonPath = path.join(appPath, 'app.json');
      if (fs.existsSync(appJsonPath)) {
        const data = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
        if (data?.expo?.name && typeof data.expo.name === 'string') {
          displayName = data.expo.name.trim();
        }
      }
    } catch (e) {}
  }

  if (!displayName) {
    // 3. Fall back to formatting folder name dynamically
    displayName = appName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Ensure clean formatting and enforce Play Store 30-character hard limit
  displayName = displayName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return displayName.slice(0, 30);
}

const SCAN_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'android',
  'ios',
  'build',
  '.gradle',
  'dist',
  'coverage',
  '.vscode',
  '.idea',
  'hooks',
  'components',
  'assets',
  'app',
  'src',
  'scripts',
  'plugins',
  'constants',
  'contexts',
  'modules',
  'lib',
  'services',
  'types',
  '__tests__',
  'test',
  'tests',
  'docs',
]);

function isReactNativeProject(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps['react-native'] || deps.expo) return true;
  } catch {
    // fall through to structural checks
  }
  return (
    fs.existsSync(path.join(dir, 'app.json')) ||
    fs.existsSync(path.join(dir, 'app.config.js')) ||
    fs.existsSync(path.join(dir, 'app.config.ts')) ||
    fs.existsSync(path.join(dir, 'android', 'app'))
  );
}

function discoverRnProjectDirs(root, { maxDepth = 5 } = {}) {
  const found = [];

  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (SCAN_SKIP_DIRS.has(name) || name.startsWith('.')) continue;
      if (name.toLowerCase().includes('-auth')) continue;

      const full = path.join(dir, name);
      if (isReactNativeProject(full)) {
        found.push(full);
        // Still scan one level deeper in case a monorepo nests another app,
        // but skip common RN internals already covered by SCAN_SKIP_DIRS.
        continue;
      }
      walk(full, depth + 1);
    }
  };

  // Also accept PROJECTS_ROOT itself if it is a single RN app
  if (isReactNativeProject(root)) {
    found.push(root);
  }
  walk(root, 0);

  // Prefer deeper paths when both a parent wrapper and nested app somehow match
  found.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length || a.localeCompare(b));
  const deduped = [];
  const seenPackages = new Set();
  const coveredByChild = new Set();

  for (const appPath of found) {
    // Skip parents of an already-accepted deeper project
    if ([...coveredByChild].some((child) => child.startsWith(appPath + path.sep))) continue;

    const folderName = path.basename(appPath);
    const packageName = extractRealPackage(appPath, folderName);
    const key = (packageName || folderName).toLowerCase();
    if (seenPackages.has(key)) continue;
    seenPackages.add(key);
    coveredByChild.add(appPath);
    deduped.push(appPath);
  }

  return deduped.sort((a, b) => a.localeCompare(b));
}

function slugifyAppId(appPath, root) {
  const rel = path.relative(root, appPath).replace(/\\/g, '/');
  const base = (rel && rel !== '.' ? rel : path.basename(appPath))
    .split('/')
    .filter(Boolean)
    .pop();
  return `real-${String(base || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

// Scan user's real React Native folder (including nested project roots)
const scanRealApps = () => {
  const scannedApps = [];
  if (!fs.existsSync(PROJECTS_ROOT)) return scannedApps;

  const projectDirs = discoverRnProjectDirs(PROJECTS_ROOT, { maxDepth: 5 });
  console.log(`[Scanner] Found ${projectDirs.length} React Native app(s) under ${PROJECTS_ROOT}`);

  for (const appPath of projectDirs) {
    const appName = path.basename(appPath);
    const appId = slugifyAppId(appPath, PROJECTS_ROOT);

    let version = '1.0.0';
    const packageName = extractRealPackage(appPath, appName);

    try {
      const pkgPath = path.join(appPath, 'package.json');
      const appJsonPath = path.join(appPath, 'app.json');
      if (fs.existsSync(appJsonPath)) {
        const appData = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
        if (appData?.expo?.version) version = appData.expo.version;
      } else if (fs.existsSync(pkgPath)) {
        const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkgData.version) version = pkgData.version;
      }
    } catch {
      // keep default version
    }

    let iconUrl = null;
    const potentialIcons = [
      path.join(appPath, 'assets', 'images', 'icon.png'),
      path.join(appPath, 'assets', 'icon.png'),
      path.join(appPath, 'assets', 'images', 'app-icon.png'),
      path.join(appPath, 'assets', 'images', 'adaptive-icon.png'),
      path.join(appPath, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png'),
    ];
    for (const icPath of potentialIcons) {
      if (fs.existsSync(icPath)) {
        iconUrl = `http://localhost:3001/api/apps/${appId}/icon`;
        break;
      }
    }

    const displayName = extractDisplayName(appPath, appName);
    const category = getCategory(appPath, appName, displayName, packageName);
    const icon = getAppIcon(appPath, appName, displayName, category);

    scannedApps.push({
      id: appId,
      name: displayName,
      packageName,
      icon,
      iconUrl,
      // Folder presence ≠ Play production. Start as Draft; Published is set by promote / known live apps.
      status: AppStatus.DRAFT,
      version,
      revenue: 0,
      downloads: 0,
      rating: 0,
      pipeline: allCompleted(createPipelineTemplate()),
      lastUpdated: '2026-07-28',
      category,
      sourcePath: appPath,
      isReal: true,
    });
  }

  return scannedApps;
};

// Initialize database
let serviceAccountEmail = '';
try {
  const saPath = process.env.PLAY_CONSOLE_KEY_PATH || path.join(process.cwd(), 'service-account.json');
  if (fs.existsSync(saPath)) {
    const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    serviceAccountEmail = sa.client_email || '';
  }
} catch (_) {}

let db = { 
  apps: [],
  settings: {
    playConsoleServiceAccount: process.env.PLAY_CONSOLE_KEY_PATH || 'service-account.json',
    serviceAccountEmail,
    accountType: 'Personal',
    projectsRoot: process.env.PROJECTS_ROOT || 'D:/Projects/RN/published',
    aiProvider: 'Gemini Pro 1.5',
    autoGenerateScreenshots: true,
    autoPublishPending: true,
    autoTranslateLocales: 49,
    autoSubmitInReview: false,
    telemetryPollingMinutes: 30
    // contactEmail / contactWebsite / testerGoogleGroups are harvested into
    // data/credentials/publisher-defaults.json from existing Play apps
  }
};

export const loadDb = () => {
  if (fs.existsSync(APPS_FILE)) {
    try {
      const parsedDb = JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
      const realApps = scanRealApps();
      const validRealIds = new Set(realApps.map((a) => a.id));

      db.apps = (parsedDb.apps || []).filter((a) => a.isReal && (validRealIds.has(a.id) || a.status === AppStatus.CREATED || a.status === AppStatus.DRAFT || a.status === 'Created'));
      if (parsedDb.settings) {
        db.settings = { ...db.settings, ...parsedDb.settings };
      }

      realApps.forEach((ra) => {
        const existingIdx = db.apps.findIndex((a) => a.id === ra.id);
        if (existingIdx === -1) {
          db.apps.unshift(ra);
        } else {
          const existing = db.apps[existingIdx];
          const preserveStatus = [
            AppStatus.PUBLISHED,
            'Published',
            AppStatus.UPDATING,
            'Updating',
            AppStatus.IN_REVIEW,
            'In Review',
            AppStatus.FAILED,
            'Failed',
            AppStatus.REJECTED,
            'Rejected',
          ].includes(existing.status);
          db.apps[existingIdx] = {
            ...existing,
            ...ra,
            // Never clobber a known pipeline / production status with scan default Draft
            status: preserveStatus ? existing.status : ra.status,
            name: ra.name || existing.name,
            revenue: existing.revenue != null && existing.revenue > 0 ? existing.revenue : ra.revenue,
            downloads:
              existing.downloads != null && existing.downloads > 0 ? existing.downloads : ra.downloads,
            rating: existing.verifiedByPlay ? existing.rating : ra.rating,
          };
        }
      });
      // Pipelines that crash (EPERM etc.) leave status stuck on Updating with no job.
      // Reconcile from Play tracks / prior status before UI loads.
      reconcileStaleUpdatingStatuses();
      saveDb();
      syncLiveTelemetry();
    } catch (e) {
      console.error('Error loading database, re-initializing...', e);
      initializeDefaultDb();
    }
  } else {
    initializeDefaultDb();
  }
  return db;
};

/**
 * Clear orphaned "Updating" badges when no pipeline is actually running.
 * Uses playProduction / statusBeforeUpdate — never invents Published for alpha-only apps.
 */
export function reconcileStaleUpdatingStatuses() {
  let changed = 0;
  for (const app of db.apps) {
    if (app.status !== AppStatus.UPDATING && app.status !== 'Updating') continue;
    const next =
      app.playProduction || app.playTracks?.production
        ? AppStatus.PUBLISHED
        : app.statusBeforeUpdate &&
            app.statusBeforeUpdate !== AppStatus.UPDATING &&
            app.statusBeforeUpdate !== 'Updating'
          ? app.statusBeforeUpdate
          : AppStatus.DRAFT;
    if (app.status !== next) {
      console.log(`[Status] Clearing stale Updating → ${next} for ${app.packageName || app.id}`);
      app.status = next;
      app.statusBeforeUpdate = null;
      app.publishMode = null;
      changed += 1;
    }
  }
  return changed;
}

const initializeDefaultDb = () => {
  db.apps = [...scanRealApps()];
  saveDb();
  syncLiveTelemetry();
};

async function syncLiveTelemetry() {
  for (const app of db.apps) {
    if (app.packageName && app.isReal) {
      try {
        const rawTitle = await fetchPlayStoreTitle(app.packageName);
        const liveTitle = rawTitle
          ? rawTitle.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          : null;
        if (liveTitle && (!app.name || app.name.toLowerCase() === app.packageName.toLowerCase())) {
          app.name = liveTitle;
          saveDb();
        }

        // Detect real Play tracks — production presence is the source of truth
        const tracks = await fetchPlayTrackPresence(app.packageName);
        if (tracks?.ok || tracks?.packageExists) {
          app.playTracks = {
            production: Boolean(tracks.production),
            alpha: Boolean(tracks.alpha),
            internal: Boolean(tracks.internal),
            beta: Boolean(tracks.beta),
            checkedAt: new Date().toISOString(),
          };
          app.playProduction = Boolean(tracks.production);
          app.playPackageExists = tracks.packageExists !== false;

          if (tracks.production) {
            // Don't interrupt an in-flight factory update job label
            if (
              app.status !== AppStatus.UPDATING &&
              app.status !== 'Updating' &&
              app.status !== AppStatus.FAILED &&
              app.status !== 'Failed'
            ) {
              app.status = AppStatus.PUBLISHED;
            }
          }
          saveDb();
          console.log(
            `[Play Tracks] ${app.packageName}: production=${Boolean(tracks.production)} alpha=${Boolean(tracks.alpha)} status=${app.status}`
          );
        } else if (tracks && tracks.packageExists === false) {
          app.playProduction = false;
          app.playPackageExists = false;
          app.playTracks = { production: false, checkedAt: new Date().toISOString(), error: tracks.error };
          saveDb();
        }

        const metrics = await fetchLiveAppMetrics(app.packageName);
        if (metrics && metrics.reviewsCount > 0) {
          app.rating = metrics.rating;
          app.verifiedByPlay = true;
          saveDb();
        }
        const monetization = await getLiveMonetizationMetrics(app);
        if (monetization && monetization.totalMonthlyRevenue > 0) {
          app.revenue = monetization.totalMonthlyRevenue;
          saveDb();
        }
      } catch (err) {}
    }
  }
}

/** Re-check Play production/alpha tracks for one or all apps (API). */
export async function syncPlayTrackStatuses(appId = null) {
  const targets = appId ? db.apps.filter((a) => a.id === appId) : db.apps.filter((a) => a.isReal && a.packageName);
  const results = [];
  for (const app of targets) {
    const tracks = await fetchPlayTrackPresence(app.packageName);
    if (tracks?.ok || tracks?.packageExists) {
      app.playTracks = {
        production: Boolean(tracks.production),
        alpha: Boolean(tracks.alpha),
        internal: Boolean(tracks.internal),
        beta: Boolean(tracks.beta),
        checkedAt: new Date().toISOString(),
      };
      app.playProduction = Boolean(tracks.production);
      app.playPackageExists = tracks.packageExists !== false;
      if (
        tracks.production &&
        app.status !== AppStatus.UPDATING &&
        app.status !== 'Updating' &&
        app.status !== AppStatus.FAILED &&
        app.status !== 'Failed'
      ) {
        app.status = AppStatus.PUBLISHED;
      }
      saveDb();
    } else if (tracks) {
      app.playProduction = false;
      app.playPackageExists = tracks.packageExists !== false;
      app.playTracks = { production: false, checkedAt: new Date().toISOString(), error: tracks.error };
      saveDb();
    }
    results.push({
      id: app.id,
      packageName: app.packageName,
      status: app.status,
      playProduction: app.playProduction,
      tracks: app.playTracks,
    });
  }
  return results;
}

export const saveDb = () => {
  // Windows: rename() cannot replace an existing file (EPERM) and often fails
  // when antivirus/IDE has apps.json open. Write temp → copyFile overwrite instead.
  const payload = JSON.stringify(db, null, 2);
  const tmp = `${APPS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, payload, 'utf8');
  try {
    fs.copyFileSync(tmp, APPS_FILE);
  } catch (err) {
    // Absolute last resort — direct write (same risk as before atomic change)
    fs.writeFileSync(APPS_FILE, payload, 'utf8');
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    // leave orphan tmp; next save uses same pid name and overwrites it
  }
};

export const getApps = () => db.apps;

export const getAppById = (id) => db.apps.find((a) => a.id === id);

export const addApp = (appData) => {
  const newApp = {
    id: `real-${Date.now()}-${appData.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    name: appData.name || 'New App',
    packageName: appData.packageName || `com.athanasso.${(appData.name || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    description: appData.description || 'AI generated application concept',
    category: appData.category || 'Productivity',
    icon: '📱',
    iconUrl: null,
    status: AppStatus.CREATED,
    version: '1.0.0',
    revenue: 0,
    downloads: 0,
    rating: 0,
    pipeline: createPipelineTemplate(),
    lastUpdated: new Date().toISOString().split('T')[0],
    sourcePath: null,
    isReal: true,
    ...appData
  };
  db.apps.unshift(newApp);
  saveDb();
  return newApp;
};

export const getSettings = () => {
  const settings = { ...(db.settings || {}) };
  // Overlay dynamically harvested publisher defaults when settings fields are empty
  try {
    const defaultsPath = path.resolve(process.cwd(), 'data', 'credentials', 'publisher-defaults.json');
    if (fs.existsSync(defaultsPath)) {
      const d = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
      if (!settings.contactEmail && d.contactEmail) settings.contactEmail = d.contactEmail;
      if (!settings.contactWebsite && d.contactWebsite) settings.contactWebsite = d.contactWebsite;
      if (!settings.privacyPolicyUrl && d.privacyPolicyUrl) settings.privacyPolicyUrl = d.privacyPolicyUrl;
      if (
        !settings.testerGoogleGroups &&
        Array.isArray(d.testerGoogleGroups) &&
        d.testerGoogleGroups.length
      ) {
        settings.testerGoogleGroups = d.testerGoogleGroups.join(', ');
      }
    }
  } catch {}
  return settings;
};

export const updateSettings = (updates) => {
  db.settings = { ...db.settings, ...updates };
  // Keep Play overview defaults in sync when settings change
  try {
    const defaultsPath = path.resolve(process.cwd(), 'data', 'credentials', 'publisher-defaults.json');
    let defaults = {};
    if (fs.existsSync(defaultsPath)) {
      defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
    }
    const next = { ...defaults };
    if (updates.contactEmail) next.contactEmail = updates.contactEmail;
    if (updates.contactWebsite) next.contactWebsite = updates.contactWebsite;
    if (updates.privacyPolicyUrl) next.privacyPolicyUrl = updates.privacyPolicyUrl;
    if (typeof updates.testerGoogleGroups === 'string') {
      next.testerGoogleGroups = updates.testerGoogleGroups
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(updates.testerGoogleGroups)) {
      next.testerGoogleGroups = updates.testerGoogleGroups;
    }
    if (!fs.existsSync(path.dirname(defaultsPath))) {
      fs.mkdirSync(path.dirname(defaultsPath), { recursive: true });
    }
    fs.writeFileSync(defaultsPath, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Settings] Could not sync publisher-defaults.json:', err.message);
  }
  saveDb();
  return db.settings;
};

export const updateApp = (id, updates) => {
  const idx = db.apps.findIndex((a) => a.id === id);
  if (idx !== -1) {
    db.apps[idx] = { ...db.apps[idx], ...updates };
    saveDb();
    return db.apps[idx];
  }
  return null;
};

// Calculate global statistics
export const getStats = () => {
  const apps = db.apps;
  const totalApps = apps.length;
  const publishedApps = apps.filter(
    (a) => a.status === AppStatus.PUBLISHED || a.status === AppStatus.APPROVED
  ).length;
  const totalRevenue = apps.reduce((sum, a) => sum + (a.revenue || 0), 0);
  const totalDownloads = apps.reduce((sum, a) => sum + (a.downloads || 0), 0);
  const ratedApps = apps.filter((a) => (a.rating || 0) > 0);
  const avgRating = ratedApps.length > 0 ? Math.round((ratedApps.reduce((sum, a) => sum + a.rating, 0) / ratedApps.length) * 10) / 10 : 0;
  const inReview = apps.filter((a) => a.status === AppStatus.IN_REVIEW).length;
  const failed = apps.filter(
    (a) => a.status === AppStatus.FAILED || a.status === AppStatus.REJECTED
  ).length;
  const inProgress = apps.filter(
    (a) => a.status === AppStatus.CREATED || a.status === AppStatus.DRAFT || a.status === AppStatus.UPDATING
  ).length;

  return {
    totalApps,
    publishedApps,
    totalRevenue,
    totalDownloads,
    avgRating,
    inReview,
    failed,
    inProgress,
    operatingCost: 0,
    mrr: totalRevenue,
    accountType: db.settings?.accountType || 'Personal',
  };
};

loadDb();
