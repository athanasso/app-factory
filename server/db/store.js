import fs from 'fs';
import path from 'path';
import { fetchLiveAppMetrics, fetchPlayStoreTitle } from '../services/playConsole.js';
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
      { id: 'admob_integration', name: 'AdMob Integration', subtitle: 'Banner · Interstitial · Rewarded', status: StepStatus.PENDING, progress: 0 },
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

const getAppIcon = (name) => {
  const map = {
    'Vehiclo': '🚗',
    'GreeceTransit': '🚌',
    'Eortologio': '📅',
    'doomscroll': '📱',
    'downloader': '⬇️',
    'flappy-bird-2': '🐦',
    'galazio': '🌊',
    'instunfollowers': '👥',
    'media-tracker': '🎬',
    'media-tracker-auth': '🔐',
    'photos-widget': '🖼️',
    'photos-widget-auth': '📸',
    'video-wallpaper': '🎥',
  };
  return map[name] || '🚀';
};

const getCategory = (name) => {
  if (name.includes('Transit') || name.includes('Vehiclo')) return 'Travel & Local';
  if (name.includes('Eortologio')) return 'Books & Reference';
  if (name.includes('flappy')) return 'Games';
  if (name.includes('media') || name.includes('video') || name.includes('photo')) return 'Media & Video';
  if (name.includes('downloader') || name.includes('widget')) return 'Tools';
  return 'Productivity';
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

// Extract human-readable Play Store title from project files or format folder name
function extractDisplayName(appPath, appName) {
  let displayName = null;

  try {
    const appJsonPath = path.join(appPath, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const data = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      if (data?.expo?.name && typeof data.expo.name === 'string') {
        const name = data.expo.name.trim();
        if (name && name.toLowerCase() !== appName.toLowerCase()) {
          displayName = name;
        }
      }
    }
  } catch (e) {}

  if (!displayName) {
    try {
      const listingPath = path.join(process.cwd(), 'data', 'apps_content', `real-${appName.toLowerCase()}`, 'locales', 'en-US', 'listing.json');
      if (fs.existsSync(listingPath)) {
        const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
        if (listing?.title && listing.title.trim()) {
          displayName = listing.title.trim();
        }
      }
    } catch (e) {}
  }

  if (!displayName) {
    if (appName.toLowerCase() === 'instunfollowers') {
      displayName = 'InstaUnfollowers';
    } else {
      displayName = appName
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  if (displayName) {
    displayName = displayName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return displayName || appName;
}

// Scan user's real React Native folder to import published apps!
const scanRealApps = () => {
  const scannedApps = [];
  if (fs.existsSync(PROJECTS_ROOT)) {
    const entries = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
    entries.forEach((entry) => {
      // Exclude sub-projects or helper prototypes (e.g. auth projects like media-tracker-auth or photos-widget-auth)
      if (entry.isDirectory() && !entry.name.toLowerCase().includes('-auth')) {
        const appName = entry.name;
        const appPath = path.join(PROJECTS_ROOT, appName);
        
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
        } catch (e) {}

        // Check if real app icon PNG exists on disk
        let iconUrl = null;
        const potentialIcons = [
          path.join(appPath, 'assets', 'images', 'icon.png'),
          path.join(appPath, 'assets', 'icon.png'),
          path.join(appPath, 'assets', 'images', 'app-icon.png'),
          path.join(appPath, 'assets', 'images', 'adaptive-icon.png'),
          path.join(appPath, 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png')
        ];
        for (const icPath of potentialIcons) {
          if (fs.existsSync(icPath)) {
            iconUrl = `http://localhost:3001/api/apps/real-${appName.toLowerCase()}/icon`;
            break;
          }
        }

        const displayName = extractDisplayName(appPath, appName);

        scannedApps.push({
          id: `real-${appName.toLowerCase()}`,
          name: displayName,
          packageName,
          icon: getAppIcon(appName),
          iconUrl,
          status: AppStatus.PUBLISHED,
          version,
          revenue: 0,
          downloads: 0,
          rating: 0,
          pipeline: allCompleted(createPipelineTemplate()),
          lastUpdated: '2026-07-28',
          category: getCategory(appName),
          sourcePath: appPath,
          isReal: true,
        });
      }
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
    autoTranslateLocales: 49,
    autoSubmitInReview: false,
    telemetryPollingMinutes: 30
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
          db.apps[existingIdx] = { 
            ...existing, 
            ...ra,
            name: ra.name || existing.name,
            revenue: (existing.revenue != null && existing.revenue > 0) ? existing.revenue : ra.revenue,
            downloads: (existing.downloads != null && existing.downloads > 0) ? existing.downloads : ra.downloads,
            rating: existing.verifiedByPlay ? existing.rating : ra.rating
          };
        }
      });
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
        const liveTitle = rawTitle ? rawTitle.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null;
        if (liveTitle && (!app.name || app.name.toLowerCase() === app.packageName.toLowerCase())) {
          app.name = liveTitle;
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

export const saveDb = () => {
  fs.writeFileSync(APPS_FILE, JSON.stringify(db, null, 2), 'utf8');
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

export const getSettings = () => db.settings;

export const updateSettings = (updates) => {
  db.settings = { ...db.settings, ...updates };
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
