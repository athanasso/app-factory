import fs from 'fs';
import path from 'path';
import { getPublisher, commitEditSafe } from './playConsole.js';
import { getApps, getSettings } from '../db/store.js';

const DEFAULTS_PATH = path.resolve(process.cwd(), 'data', 'credentials', 'publisher-defaults.json');

/**
 * Structural defaults only — contact/testers are harvested from live Play apps.
 * App privacy pages live on the portfolio: /privacy-policy/{slug}/
 */
const STRUCTURAL_DEFAULTS = {
  defaultLanguage: 'en-US',
  contactWebsite: null,
  contactEmail: null,
  privacyPolicyUrl:
    process.env.PRIVACY_POLICY_URL_TEMPLATE ||
    'https://athanasopoulos.is-a.dev/privacy-policy/{slug}/',
  privacyPoliciesRoot: process.env.PRIVACY_POLICIES_ROOT || 'D:/Projects/privacy-policies',
  privacyPoliciesPortfolioRoot:
    process.env.PRIVACY_POLICIES_PORTFOLIO_ROOT ||
    'D:/Projects/Next js/next-portfolio/public/privacy-policy',
  privacyPoliciesBaseUrl: 'https://athanasopoulos.is-a.dev/privacy-policy',
  testerGoogleGroups: [],
  testerTracks: ['alpha', 'internal'],
  harvestedFrom: null,
  harvestedAt: null,
};

function ensureDir() {
  const dir = path.dirname(DEFAULTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStoredDefaults() {
  if (!fs.existsSync(DEFAULTS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
}

function settingsOverrides() {
  try {
    const s = getSettings() || {};
    const out = {};
    if (s.contactEmail) out.contactEmail = s.contactEmail;
    if (s.contactWebsite) out.contactWebsite = s.contactWebsite;
    if (s.privacyPolicyUrl) out.privacyPolicyUrl = s.privacyPolicyUrl;
    if (s.privacyPoliciesBaseUrl) out.privacyPoliciesBaseUrl = s.privacyPoliciesBaseUrl;
    if (typeof s.testerGoogleGroups === 'string' && s.testerGoogleGroups.trim()) {
      out.testerGoogleGroups = s.testerGoogleGroups
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    } else if (Array.isArray(s.testerGoogleGroups) && s.testerGoogleGroups.length) {
      out.testerGoogleGroups = s.testerGoogleGroups;
    }
    return out;
  } catch {
    return {};
  }
}

const PORTFOLIO_PRIVACY_TEMPLATE =
  'https://athanasopoulos.is-a.dev/privacy-policy/{slug}/';

/** Resolve Play privacy URL from portfolio template + slug. */
export function resolvePrivacyPolicyUrl(slug, defaults = null) {
  const d = defaults || loadPublisherDefaults();
  const template =
    d.privacyPolicyUrl ||
    STRUCTURAL_DEFAULTS.privacyPolicyUrl ||
    PORTFOLIO_PRIVACY_TEMPLATE;
  if (!slug) return template;
  return String(template).replace(/\{slug\}/g, slug);
}

function withDerivedFields(raw = {}) {
  const privacyPolicyUrl =
    raw.privacyPolicyUrl ||
    STRUCTURAL_DEFAULTS.privacyPolicyUrl ||
    PORTFOLIO_PRIVACY_TEMPLATE;

  return {
    ...STRUCTURAL_DEFAULTS,
    ...raw,
    privacyPoliciesBaseUrl:
      raw.privacyPoliciesBaseUrl || STRUCTURAL_DEFAULTS.privacyPoliciesBaseUrl,
    privacyPoliciesPortfolioRoot:
      raw.privacyPoliciesPortfolioRoot || STRUCTURAL_DEFAULTS.privacyPoliciesPortfolioRoot,
    privacyPolicyUrl,
    testerGoogleGroups: Array.isArray(raw.testerGoogleGroups) ? raw.testerGoogleGroups : [],
    testerTracks:
      Array.isArray(raw.testerTracks) && raw.testerTracks.length
        ? raw.testerTracks
        : STRUCTURAL_DEFAULTS.testerTracks,
  };
}

/**
 * Dynamically resolve publisher defaults:
 * settings overrides → harvested JSON file → structural empty shell.
 * Call harvestPublisherDefaultsFromExistingApps() to refresh from Play.
 */
export function loadPublisherDefaults() {
  ensureDir();
  const stored = readStoredDefaults();
  const overrides = settingsOverrides();
  return withDerivedFields({ ...stored, ...overrides });
}

export function savePublisherDefaults(updates = {}) {
  ensureDir();
  const prev = readStoredDefaults();
  const merged = withDerivedFields({ ...prev, ...updates, updatedAt: new Date().toISOString() });
  // Persist without re-applying settings overrides into the file
  const toWrite = { ...prev, ...updates, updatedAt: merged.updatedAt };
  if (merged.privacyPoliciesBaseUrl && !toWrite.privacyPoliciesBaseUrl) {
    toWrite.privacyPoliciesBaseUrl = merged.privacyPoliciesBaseUrl;
  }
  if (merged.privacyPolicyUrl && !toWrite.privacyPolicyUrl) {
    toWrite.privacyPolicyUrl = merged.privacyPolicyUrl;
  }
  fs.writeFileSync(DEFAULTS_PATH, JSON.stringify(toWrite, null, 2), 'utf8');
  return loadPublisherDefaults();
}

function isComplete(defaults) {
  return Boolean(
    defaults?.contactEmail &&
      defaults?.contactWebsite &&
      Array.isArray(defaults?.testerGoogleGroups) &&
      defaults.testerGoogleGroups.length > 0
  );
}

/**
 * Pull contact details + tester Google Groups from already-uploaded Play apps.
 * Nothing personal is hardcoded — values come from live edits.details / edits.testers.
 */
export async function harvestPublisherDefaultsFromExistingApps({ force = false } = {}) {
  const existing = loadPublisherDefaults();
  if (!force && existing.harvestedFrom && isComplete(existing)) {
    return { ...existing, cached: true };
  }

  const publisher = getPublisher();
  if (!publisher) {
    console.warn('[Publisher Defaults] No Play publisher client — cannot harvest dynamically');
    return { ...existing, cached: false, source: 'no-publisher' };
  }

  const apps = (getApps() || []).filter((a) => a.isReal && a.packageName);
  // Prefer apps that already have successful uploads / look established
  const preferred = [
    ...apps.filter((a) => a.status === 'Published'),
    ...apps,
  ];

  let best = {
    contactWebsite: existing.contactWebsite || null,
    contactEmail: existing.contactEmail || null,
    defaultLanguage: existing.defaultLanguage || 'en-US',
    testerGoogleGroups: [...(existing.testerGoogleGroups || [])],
    testerTracks: [...(existing.testerTracks || [])],
    harvestedFrom: null,
  };

  for (const app of preferred) {
    try {
      console.log(`[Publisher Defaults] Harvesting overview from ${app.packageName}...`);
      const editRes = await publisher.edits.insert({ packageName: app.packageName });
      const editId = editRes.data.id;

      let details = {};
      try {
        const detailsRes = await publisher.edits.details.get({
          packageName: app.packageName,
          editId,
        });
        details = detailsRes.data || {};
      } catch (err) {
        console.warn(`[Publisher Defaults] details.get failed for ${app.packageName}: ${err.message}`);
      }

      let tracks = ['alpha', 'internal', 'beta'];
      try {
        const tracksRes = await publisher.edits.tracks.list({ packageName: app.packageName, editId });
        tracks = (tracksRes.data.tracks || []).map((t) => t.track).filter(Boolean);
      } catch {
        // keep candidate tracks
      }

      const googleGroups = [];
      for (const track of tracks) {
        if (track === 'production') continue;
        try {
          const testersRes = await publisher.edits.testers.get({
            packageName: app.packageName,
            editId,
            track,
          });
          for (const g of testersRes.data?.googleGroups || []) {
            if (g && !googleGroups.includes(g)) googleGroups.push(g);
          }
        } catch {
          // track may not support testers
        }
      }

      await publisher.edits.delete({ packageName: app.packageName, editId }).catch(() => {});

      if (details.contactWebsite) best.contactWebsite = details.contactWebsite;
      if (details.contactEmail) best.contactEmail = details.contactEmail;
      if (details.defaultLanguage) best.defaultLanguage = details.defaultLanguage;
      for (const g of googleGroups) {
        if (!best.testerGoogleGroups.includes(g)) best.testerGoogleGroups.push(g);
      }
      best.testerTracks = tracks.filter((t) => t !== 'production');
      best.harvestedFrom = app.packageName;

      // First complete harvest is enough
      if (best.contactEmail && best.contactWebsite && best.testerGoogleGroups.length) {
        break;
      }
    } catch (err) {
      console.warn(`[Publisher Defaults] Harvest failed for ${app.packageName}: ${err.message}`);
    }
  }

  if (!best.contactEmail && !best.contactWebsite && best.testerGoogleGroups.length === 0) {
    console.warn('[Publisher Defaults] Harvest found no contact/tester data on any app');
    return { ...existing, cached: false, source: 'empty-harvest' };
  }

  const saved = savePublisherDefaults({
    defaultLanguage: best.defaultLanguage || 'en-US',
    contactWebsite: best.contactWebsite,
    contactEmail: best.contactEmail,
    // Portfolio path — never derive from contactWebsite alone without /privacy-policy
    privacyPolicyUrl:
      existing.privacyPolicyUrl?.includes('privacy-policy/{slug}')
        ? existing.privacyPolicyUrl
        : PORTFOLIO_PRIVACY_TEMPLATE,
    privacyPoliciesPortfolioRoot:
      existing.privacyPoliciesPortfolioRoot ||
      STRUCTURAL_DEFAULTS.privacyPoliciesPortfolioRoot,
    privacyPoliciesBaseUrl: STRUCTURAL_DEFAULTS.privacyPoliciesBaseUrl,
    privacyPoliciesRoot:
      existing.privacyPoliciesRoot ||
      process.env.PRIVACY_POLICIES_ROOT ||
      STRUCTURAL_DEFAULTS.privacyPoliciesRoot,
    testerGoogleGroups: best.testerGoogleGroups,
    testerTracks: best.testerTracks.length ? best.testerTracks : ['alpha', 'internal'],
    harvestedFrom: best.harvestedFrom,
    harvestedAt: new Date().toISOString(),
    note: 'Contact/testers from Play. Privacy pages on portfolio /privacy-policy/{slug}/.',
  });

  console.log(
    `[Publisher Defaults] ✔ Harvested from ${best.harvestedFrom}: email=${Boolean(best.contactEmail)}, website=${Boolean(best.contactWebsite)}, groups=${best.testerGoogleGroups.length}`
  );
  return { ...saved, cached: false, source: best.harvestedFrom };
}

/**
 * Apply store listing overview (contact email/website) + closed-test Google Groups
 * to a new app, matching already-uploaded titles.
 */
export async function syncStoreOverviewViaAPI(packageName, { tracks } = {}) {
  const publisher = getPublisher();
  if (!publisher || !packageName) {
    return { success: false, error: 'Publisher credentials or package name missing' };
  }

  // Always refresh from live apps when incomplete
  let defaults = loadPublisherDefaults();
  if (!isComplete(defaults)) {
    defaults = await harvestPublisherDefaultsFromExistingApps({ force: true });
  }

  if (!defaults.contactEmail || !defaults.contactWebsite) {
    return {
      success: false,
      error: 'No contact email/website found on existing Play apps — harvest returned empty',
    };
  }

  const targetTracks = tracks?.length
    ? tracks
    : defaults.testerTracks?.length
      ? defaults.testerTracks
      : ['alpha', 'internal'];

  try {
    console.log(`[Play API Overview] Syncing store overview for ${packageName}...`);
    const editRes = await publisher.edits.insert({ packageName });
    const editId = editRes.data.id;

    await publisher.edits.details.update({
      packageName,
      editId,
      requestBody: {
        defaultLanguage: defaults.defaultLanguage || 'en-US',
        contactWebsite: defaults.contactWebsite,
        contactEmail: defaults.contactEmail,
      },
    });
    console.log(
      `[Play API Overview] ✔ Details set: ${defaults.contactEmail} · ${defaults.contactWebsite}`
    );

    const appliedTracks = [];
    const trackErrors = [];
    const groups = defaults.testerGoogleGroups || [];
    for (const track of targetTracks) {
      if (track === 'production') continue;
      if (!groups.length) break;
      try {
        await publisher.edits.testers.update({
          packageName,
          editId,
          track,
          requestBody: { googleGroups: groups },
        });
        appliedTracks.push(track);
        console.log(`[Play API Overview] ✔ Testers on '${track}': ${groups.join(', ')}`);
      } catch (err) {
        trackErrors.push({ track, error: err.message });
        console.warn(`[Play API Overview] Testers update skipped for '${track}': ${err.message}`);
      }
    }

    await commitEditSafe(publisher, packageName, editId);

    return {
      success: true,
      packageName,
      contactEmail: defaults.contactEmail,
      contactWebsite: defaults.contactWebsite,
      defaultLanguage: defaults.defaultLanguage,
      privacyPolicyUrl: defaults.privacyPolicyUrl,
      testerGoogleGroups: groups,
      appliedTracks,
      trackErrors,
      summary: `✔ Overview synced (${defaults.contactEmail}) · testers on [${appliedTracks.join(', ') || 'none'}]`,
    };
  } catch (err) {
    console.warn(`[Play API Overview] Sync failed for ${packageName}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Back-compat export name (no longer a static personal fallback)
export const FALLBACK_PUBLISHER_DEFAULTS = STRUCTURAL_DEFAULTS;
