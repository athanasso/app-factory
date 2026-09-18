import fs from 'fs';
import path from 'path';
import { getApps } from '../db/store.js';
import { getPublisher, commitEditSafe } from './playConsole.js';
import {
  loadPublisherDefaults,
  resolvePrivacyPolicyUrl,
} from './publisherDefaults.js';
import { privacySlugForApp, vercelPrivacySlugForApp } from './privacyPolicy.js';

const OLD_URL_PATTERNS = [
  /https?:\/\/[a-z0-9-]+-privacy-policy\.vercel\.app\/?/gi,
  /https?:\/\/athanasopoulos\.is-a\.dev\/(?!privacy-policy\/)[a-z0-9-]+\/?/gi,
];

function rewritePrivacyMentions(text, newUrl) {
  if (!text) return text;
  let next = String(text);
  for (const re of OLD_URL_PATTERNS) {
    next = next.replace(re, newUrl);
  }
  // Ensure a privacy line exists
  if (!next.includes(newUrl) && !/privacy policy/i.test(next)) {
    next = `${next.trim()}\n\n🔒 Privacy Policy: ${newUrl}`;
  } else if (!next.includes(newUrl) && /Privacy Policy:/i.test(next)) {
    next = next.replace(
      /🔒?\s*Privacy Policy:\s*\S+/i,
      `🔒 Privacy Policy: ${newUrl}`
    );
  }
  return next;
}

function updateLocalListing(app, newUrl) {
  const listingPath = path.resolve(
    process.cwd(),
    'data',
    'apps_content',
    app.id,
    'locales',
    'en-US',
    'listing.json'
  );
  if (!fs.existsSync(listingPath)) {
    return { updated: false, reason: 'no local listing.json' };
  }
  const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
  listing.privacyPolicyUrl = newUrl;
  if (listing.fullDescription) {
    listing.fullDescription = rewritePrivacyMentions(listing.fullDescription, newUrl);
  }
  fs.writeFileSync(listingPath, JSON.stringify(listing, null, 2), 'utf8');
  return { updated: true, path: listingPath };
}

/**
 * Update local + Play store listing text with portfolio privacy URLs.
 * Note: Play Console "App content → Privacy policy" field has no public API;
 * listing description URLs are updated via edits.listings.
 */
export async function syncAllPrivacyPolicyUrls({ dryRun = false } = {}) {
  const defaults = loadPublisherDefaults();
  const publisher = getPublisher();
  const apps = (getApps() || []).filter((a) => a.isReal && a.packageName);
  const results = [];

  for (const app of apps) {
    const slug = privacySlugForApp(app);
    const newUrl = resolvePrivacyPolicyUrl(slug, defaults);
    const legacyVercel = `https://${vercelPrivacySlugForApp(app)}-privacy-policy.vercel.app/`;
    const local = updateLocalListing(app, newUrl);

    const entry = {
      id: app.id,
      name: app.name,
      packageName: app.packageName,
      slug,
      newUrl,
      legacyVercel,
      local,
      play: null,
    };

    if (!publisher) {
      entry.play = { success: false, error: 'No Play publisher client' };
      results.push(entry);
      continue;
    }

    if (dryRun) {
      entry.play = { success: true, dryRun: true };
      results.push(entry);
      continue;
    }

    try {
      const editRes = await publisher.edits.insert({ packageName: app.packageName });
      const editId = editRes.data.id;
      const listingsRes = await publisher.edits.listings.list({
        packageName: app.packageName,
        editId,
      });
      const listings = listingsRes.data.listings || [];
      let touched = 0;

      for (const listing of listings) {
        const language = listing.language;
        const fullDescription = rewritePrivacyMentions(listing.fullDescription || '', newUrl);
        if (fullDescription === (listing.fullDescription || '')) continue;
        await publisher.edits.listings.update({
          packageName: app.packageName,
          editId,
          language,
          requestBody: {
            language,
            title: listing.title,
            shortDescription: listing.shortDescription,
            fullDescription,
            video: listing.video,
          },
        });
        touched += 1;
      }

      if (touched > 0) {
        await commitEditSafe(publisher, app.packageName, editId);
        entry.play = {
          success: true,
          listingsUpdated: touched,
          note: 'Updated listing description privacy links. App content Privacy Policy field must be set in Play Console UI (no public API).',
        };
      } else {
        await publisher.edits.delete({ packageName: app.packageName, editId }).catch(() => {});
        entry.play = {
          success: true,
          listingsUpdated: 0,
          note: 'No listing description changes needed. Set App content → Privacy Policy manually to the new URL.',
        };
      }
      console.log(`[Privacy Sync] ✔ ${app.packageName} → ${newUrl}`);
    } catch (err) {
      entry.play = { success: false, error: err.message };
      console.warn(`[Privacy Sync] ✖ ${app.packageName}: ${err.message}`);
    }

    results.push(entry);
  }

  const outDir = path.resolve(process.cwd(), 'data', 'credentials');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, 'privacy-url-sync-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ syncedAt: new Date().toISOString(), results }, null, 2),
    'utf8'
  );

  return {
    success: true,
    count: results.length,
    reportPath,
    results,
    manualAppContentRequired: results.map((r) => ({
      packageName: r.packageName,
      privacyPolicyUrl: r.newUrl,
    })),
    summary: `✔ Synced privacy URLs for ${results.length} apps (listing text). App content Privacy Policy field still needs Console update per app.`,
  };
}
