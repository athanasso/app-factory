import fs from 'fs';
import path from 'path';
import { getModel, generateContentWithRetry } from './content.js';
import { detectMonetizationUsage } from './monetizationIntegration.js';
import { loadPublisherDefaults, savePublisherDefaults, resolvePrivacyPolicyUrl } from './publisherDefaults.js';

const DEFAULT_ROOT = process.env.PRIVACY_POLICIES_ROOT || 'D:/Projects/privacy-policies';

const CONTACT_EMAIL_FALLBACK = null;
const DEVELOPER_NAME = 'Athanasso';

function resolveContactEmail() {
  const d = loadPublisherDefaults();
  return d.contactEmail || CONTACT_EMAIL_FALLBACK || '';
}

/** Obfuscate email as HTML entities (matches existing privacy-policy pages) */
function obfuscateEmail(email) {
  return String(email)
    .split('')
    .map((ch) => `&#${ch.charCodeAt(0)};`)
    .join('');
}

const SLUG_ALIASES = {
  'downloader-fetchit': 'fetchit',
  greecetransit: 'greece-transit',
  'greece-transit': 'greece-transit',
  'video-wallpaper': 'video-to-wallpaper',
  videowallpaper: 'video-to-wallpaper',
  'flappy-bird-2': 'flappy-bird-2',
  'photos-widget': 'photos-widget',
  'media-tracker': 'media-tracker',
  instunfollowers: 'instunfollowers',
  eortologio: 'eortologio',
  doomscroll: 'doomscroll',
  galazio: 'galazio',
  vehiclo: 'vehiclo',
  astralogos: 'astralogos',
  fuelgr: 'fuelgr',
  fuelgreece: 'fuelgr',
};

/** Vercel project name overrides when folder slug ≠ deploy slug */
const VERCEL_SLUG_ALIASES = {
  doomscroll: 'doomscroll-detox',
  'doomscroll-detox': 'doomscroll-detox',
};

export function privacySlugForApp(app) {
  const fromPath = app.sourcePath ? path.basename(app.sourcePath) : '';
  const fromId = String(app.id || '')
    .replace(/^real-/, '')
    .toLowerCase();
  const raw = (fromPath || fromId || app.packageName || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return SLUG_ALIASES[raw] || SLUG_ALIASES[fromId] || raw;
}

export function vercelPrivacySlugForApp(app) {
  const slug = privacySlugForApp(app);
  return VERCEL_SLUG_ALIASES[slug] || slug;
}

function extractPrimaryColor(app) {
  if (!app.sourcePath) return '#2563eb';
  for (const file of ['app.json', 'app.config.js', 'app.config.ts']) {
    const fp = path.join(app.sourcePath, file);
    if (!fs.existsSync(fp)) continue;
    try {
      const text = fs.readFileSync(fp, 'utf8');
      if (file === 'app.json') {
        const json = JSON.parse(text);
        const expo = json.expo || json;
        const color =
          expo?.android?.adaptiveIcon?.backgroundColor ||
          expo?.splash?.backgroundColor ||
          expo?.android?.splash?.backgroundColor ||
          expo?.primaryColor ||
          expo?.extra?.primaryColor;
        if (color && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return color;
      }
      const m = text.match(/#[0-9a-fA-F]{6}/);
      if (m) return m[0];
    } catch {
      // continue
    }
  }
  return '#2563eb';
}

function detectPermissionHints(app) {
  const hints = [];
  if (!app.sourcePath) return hints;
  const manifest = path.join(
    app.sourcePath,
    'android',
    'app',
    'src',
    'main',
    'AndroidManifest.xml'
  );
  let text = '';
  try {
    if (fs.existsSync(manifest)) text += fs.readFileSync(manifest, 'utf8');
  } catch {}
  try {
    const appJson = path.join(app.sourcePath, 'app.json');
    if (fs.existsSync(appJson)) text += fs.readFileSync(appJson, 'utf8');
  } catch {}

  if (/ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|location/i.test(text)) {
    hints.push('Location — used to provide nearby / map features; processed on-device where possible.');
  }
  if (/CAMERA/i.test(text)) hints.push('Camera — used only for in-app features you explicitly start.');
  if (/READ_MEDIA|READ_EXTERNAL|WRITE_EXTERNAL|photo|gallery/i.test(text)) {
    hints.push('Photos / storage — used to read or cache media you select; not uploaded to our servers.');
  }
  if (/RECORD_AUDIO|microphone/i.test(text)) {
    hints.push('Microphone — used only when you enable voice features.');
  }
  if (/POST_NOTIFICATIONS|NOTIFICATION/i.test(text)) {
    hints.push('Notifications — used for reminders, alerts, and service status.');
  }
  if (/BIND_ACCESSIBILITY|ACCESSIBILITY/i.test(text)) {
    hints.push(
      'Accessibility Service — used strictly for on-device core features; screen content is not uploaded.'
    );
  }
  if (/SYSTEM_ALERT_WINDOW|overlay/i.test(text)) {
    hints.push('Display over other apps — used for blocking / overlay UI when required by core features.');
  }
  if (/INTERNET/i.test(text) || true) {
    hints.push('Internet — required for ads, purchases, maps, or online APIs the App depends on.');
  }
  return hints;
}

function buildFallbackSections(app, usage) {
  const name = app.name || 'the App';
  const category = app.category || 'productivity';
  const thirdParties = [];
  if (usage.usesAdMob) {
    thirdParties.push(
      '<strong>Google AdMob:</strong> Free users may see ads. AdMob may collect device advertising identifiers and usage metrics. You can control ad personalization in device settings. Premium / Pro unlocks may remove ads.'
    );
  }
  if (usage.usesRevenueCat) {
    thirdParties.push(
      '<strong>RevenueCat:</strong> Manages in-app purchases and subscription entitlements. Processes anonymous app user IDs and store purchase tokens to validate premium status.'
    );
  }
  thirdParties.push(
    '<strong>Usage Data:</strong> Anonymous crash reports and diagnostics may be collected by the OS or frameworks to improve stability.'
  );

  const perms = detectPermissionHints(app);
  const permLis =
    perms.length > 0
      ? perms.map((p) => `<li>${p}</li>`).join('\n            ')
      : '<li><strong>Internet Access:</strong> Required for core online features, advertisements, and/or purchases.</li>';

  return {
    intro: `${name} is designed with privacy in mind for ${category.toLowerCase()} use. The Developer does not operate a first-party backend that stores your name, email, or contacts from this App.`,
    dataCollected: `<p><strong>${escapeHtml(name)}</strong> does not independently collect personally identifiable information on Developer-operated servers. Data you create in the App (preferences, history, favorites) is stored <strong>locally</strong> on your device unless a feature you explicitly use requires a third-party provider.</p>
        <p>The App may rely on third-party services:</p>
        <ul>
            ${thirdParties.map((t) => `<li>${t}</li>`).join('\n            ')}
        </ul>`,
    permissions: `<p>To provide its functionality, <strong>${escapeHtml(name)}</strong> may request:</p>
        <ul>
            ${permLis}
        </ul>
        <p>You can revoke permissions in system settings. Core features that depend on a permission will stop working if it is denied.</p>`,
    advertising: usage.usesAdMob
      ? `<p><strong>${escapeHtml(name)}</strong> may display advertisements powered by <strong>Google AdMob</strong> for free users. AdMob may use the Google Advertising ID. Premium subscribers (when available) can enjoy an ad-free experience.</p>`
      : '',
    retention: `<p>Because the Developer does not collect personal data directly through ${escapeHtml(name)}, we do not store personal records on our servers. Local App data can be erased by clearing App storage or uninstalling.</p>`,
    thirdPartyLinks: `<ul>
            <li><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>${usage.usesAdMob ? ' (AdMob / Google Mobile Ads)' : ''}</li>
            ${
              usage.usesRevenueCat
                ? '<li><a href="https://www.revenuecat.com/privacy" target="_blank" rel="noopener noreferrer">RevenueCat Privacy Policy</a></li>'
                : ''
            }
        </ul>`,
  };
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function synthesizeSectionsWithAi(app, usage) {
  try {
    const model = getModel();
    const prompt = `You write Google Play–ready privacy policies for Athanasso Android apps.
App name: "${app.name}"
Package: ${app.packageName || 'n/a'}
Category: ${app.category || 'n/a'}
Description: ${(app.description || '').slice(0, 500)}
Uses AdMob: ${usage.usesAdMob}
Uses RevenueCat: ${usage.usesRevenueCat}

Return ONLY valid JSON (no markdown) with keys:
{
  "intro": "1-2 sentences about the app purpose and privacy stance",
  "dataCollectedHtml": "HTML for Types of Data Collected (use <p> and <ul><li>). Mention on-device storage. Include AdMob/RevenueCat bullets only if used.",
  "permissionsHtml": "HTML for Permissions section with realistic Android permissions for this app type",
  "advertisingHtml": "HTML Advertising section or empty string if no ads",
  "retentionHtml": "HTML Retention section",
  "thirdPartyLinksHtml": "HTML <ul> of relevant third-party policy links"
}
Be accurate, concise, and match a professional privacy-policy tone. Do not invent that we collect emails/passwords.`;

    const result = await generateContentWithRetry(model, prompt);
    const text = result.response
      .text()
      .replace(/```json|```/g, '')
      .trim();
    const parsed = JSON.parse(text);
    return {
      intro: parsed.intro,
      dataCollected: parsed.dataCollectedHtml,
      permissions: parsed.permissionsHtml,
      advertising: parsed.advertisingHtml || '',
      retention: parsed.retentionHtml,
      thirdPartyLinks: parsed.thirdPartyLinksHtml,
    };
  } catch (err) {
    console.warn(`[Privacy Policy] AI synthesis fallback for ${app.name}: ${err.message}`);
    return null;
  }
}

function renderHtml({ appName, primaryColor, sections, year, contactEmail }) {
  const emailHtml = obfuscateEmail(contactEmail || resolveContactEmail());
  const advertisingBlock = sections.advertising
    ? `
        <h2>Advertising</h2>
        ${sections.advertising}
`
    : '';

  return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Policy - ${escapeHtml(appName)}</title>
    <style>
        /* CSS variables for consistent theming */
        :root {
            --primary-color: ${primaryColor};
            --text-color: #1f2937;
            --bg-color: #f3f4f6;
            --container-bg: #ffffff;
            --secondary-text: #4b5563;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            line-height: 1.6;
            margin: 0;
            padding: 20px;
        }

        .container {
            max-width: 800px;
            margin: 40px auto;
            background: var(--container-bg);
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        h1 {
            color: var(--text-color);
            font-size: 2.25rem;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid var(--bg-color);
        }

        h2 {
            color: var(--primary-color);
            font-size: 1.5rem;
            margin-top: 2rem;
            margin-bottom: 1rem;
        }

        h3 {
            color: var(--text-color);
            font-size: 1.1rem;
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
        }

        p {
            margin-bottom: 1rem;
            color: var(--secondary-text);
        }

        ul {
            margin-bottom: 1rem;
            padding-left: 1.5rem;
            color: var(--secondary-text);
        }

        li {
            margin-bottom: 0.5rem;
        }

        .footer {
            margin-top: 3rem;
            padding-top: 2rem;
            border-bottom: 1px solid var(--bg-color);
            font-size: 0.875rem;
            color: #9ca3af;
            text-align: center;
        }

        a {
            color: var(--primary-color);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        @media (max-width: 600px) {
            .container {
                padding: 20px;
                margin: 20px auto;
            }

            h1 {
                font-size: 1.75rem;
            }
        }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>

<body>
    <div class="container">
        <h1>Privacy Policy for ${escapeHtml(appName)}</h1>
        <p><strong>Last updated:</strong> ${new Date().toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}</p>

        <p>This Privacy Policy describes the policies and procedures of <strong>${DEVELOPER_NAME}</strong> (referred to as "We",
            "Us", "Our", or "Developer") regarding the collection, use, and disclosure of Your information when You use
            the <strong>${escapeHtml(appName)}</strong> mobile application (the "Service", or "App").</p>

        <p>${escapeHtml(sections.intro)}</p>

        <h2>Interpretation and Definitions</h2>
        <p>The words of which the initial letter is capitalized have meanings defined under the following conditions.
            The following definitions shall have the same meaning regardless of whether they appear in singular or in
            plural.</p>

        <h2>Collecting and Using Your Personal Data</h2>

        <h3>Types of Data Collected</h3>
        ${sections.dataCollected}

        <h3>Permissions Required by the App</h3>
        ${sections.permissions}
${advertisingBlock}
        <h2>Retention of Your Data</h2>
        ${sections.retention}

        <h2>Links to Other Websites and Third-Party Policies</h2>
        <p>Our Service may contain links to other websites that are not operated by Us. We strongly advise You to review
            the Privacy Policy of every site you visit. Our third-party providers include:</p>
        ${sections.thirdPartyLinks}

        <h2>Changes to this Privacy Policy</h2>
        <p>We may update Our Privacy Policy from time to time. We will notify You of any changes by posting the new
            Privacy Policy on this page.</p>

        <h2>Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, the ${escapeHtml(appName)} application, or ${DEVELOPER_NAME}'s
            practices, please contact us:</p>
        <ul>
            <li>By email:
                <strong>${emailHtml}</strong>
            </li>
        </ul>

        <div class="footer">
            &copy; ${year} ${DEVELOPER_NAME} (${escapeHtml(appName)}). All rights reserved.
        </div>
    </div>
</body>

</html>
`;
}

function privacyUrlForSlug(slug) {
  // Manual Vercel deploys: https://{slug}-privacy-policy.vercel.app/
  const vercelSlug = VERCEL_SLUG_ALIASES[slug] || slug;
  return resolvePrivacyPolicyUrl(vercelSlug);
}

/**
 * Generate (or refresh) a privacy policy HTML page under D:/Projects/privacy-policies/{slug}
 * matching the style of existing Athanasso policies.
 */
export async function generatePrivacyPolicy(app, { force = false } = {}) {
  const root = process.env.PRIVACY_POLICIES_ROOT || DEFAULT_ROOT;
  const slug = privacySlugForApp(app);
  const dir = path.join(root, slug);
  const filePath = path.join(dir, 'index.html');
  const url = privacyUrlForSlug(slug);

  if (!force && fs.existsSync(filePath)) {
    console.log(`[Privacy Policy] ✔ Existing policy for ${app.name} at ${filePath}`);
    return {
      skipped: false,
      existed: true,
      slug,
      path: filePath,
      url,
      summary: `✔ Privacy HTML ready at ${filePath} · Play URL after Vercel upload: ${url}`,
    };
  }

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const usage = detectMonetizationUsage(app.sourcePath);
  const aiSections = await synthesizeSectionsWithAi(app, usage);
  const fallback = buildFallbackSections(app, usage);
  const sections = {
    intro: aiSections?.intro || fallback.intro,
    dataCollected: aiSections?.dataCollected || fallback.dataCollected,
    permissions: aiSections?.permissions || fallback.permissions,
    advertising: aiSections?.advertising ?? fallback.advertising,
    retention: aiSections?.retention || fallback.retention,
    thirdPartyLinks: aiSections?.thirdPartyLinks || fallback.thirdPartyLinks,
  };

  const defaults = loadPublisherDefaults();
  const html = renderHtml({
    appName: app.name || slug,
    primaryColor: extractPrimaryColor(app),
    sections,
    year: new Date().getFullYear(),
    contactEmail: defaults.contactEmail,
  });

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`[Privacy Policy] ✔ Wrote ${filePath}`);

  // Persist URL onto store listing metadata
  try {
    const listingPath = path.resolve(
      process.cwd(),
      'data',
      'apps_content',
      app.id,
      'locales',
      'en-US',
      'listing.json'
    );
    if (fs.existsSync(listingPath)) {
      const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
      listing.privacyPolicyUrl = url;
      if (defaults.contactEmail) listing.contactEmail = defaults.contactEmail;
      if (defaults.contactWebsite) listing.contactWebsite = defaults.contactWebsite;
      fs.writeFileSync(listingPath, JSON.stringify(listing, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn(`[Privacy Policy] listing annotate warning: ${err.message}`);
  }

  // Keep factory defaults aware of privacy policies root only (URLs stay harvested)
  try {
    savePublisherDefaults({
      privacyPoliciesRoot: root,
    });
  } catch {}

  // Save generation record
  try {
    const outDir = path.resolve(process.cwd(), 'data', 'apps_content', app.id, 'submission');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'privacy_policy.json'),
      JSON.stringify(
        {
          slug,
          path: filePath,
          url,
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {}

  return {
    skipped: false,
    existed: false,
    slug,
    path: filePath,
    url,
    summary: `✔ Generated privacy HTML at ${filePath} · Play URL after Vercel upload: ${url}`,
  };
}
