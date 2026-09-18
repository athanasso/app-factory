/**
 * Upgrade all portfolio public/privacy-policy/{slug}/index.html pages
 * to the improved Athanasso chrome while preserving app-specific body content.
 */
import fs from 'fs';
import path from 'path';
import {
  buildPrivacyPageShell,
  obfuscateEmail,
} from '../server/services/privacyPolicyTemplate.js';

const ROOT =
  process.env.PRIVACY_POLICIES_PORTFOLIO_ROOT ||
  'D:/Projects/Next js/next-portfolio/public/privacy-policy';

const CONTACT = 'manos.athanasopoulos99@gmail.com';

function extractBetween(html, startRe, endRe) {
  const start = html.search(startRe);
  if (start < 0) return null;
  const from = html.slice(start);
  const end = from.search(endRe);
  return end >= 0 ? from.slice(0, end) : from;
}

function upgradeFile(filePath, slug) {
  const html = fs.readFileSync(filePath, 'utf8');

  // Already upgraded
  if (html.includes('class="topbar"') && html.includes('App privacy policy')) {
    return { slug, status: 'skipped' };
  }

  const colorMatch = html.match(/--primary-color:\s*([^;]+);/);
  const primaryColor = (colorMatch?.[1] || '#2563eb').trim();

  const titleMatch =
    html.match(/<title>Privacy Policy\s*[-—]\s*([^|<]+)/i) ||
    html.match(/<h1[^>]*>Privacy Policy for\s+([^<]+)<\/h1>/i);
  const appName = (titleMatch?.[1] || slug).trim();

  const updatedMatch = html.match(/Last updated:<\/strong>\s*([^<]+)/i);
  const lastUpdated = updatedMatch?.[1]?.trim() || undefined;

  // Prefer content inside .container; strip old h1 / last-updated / footer / contact
  let container = extractBetween(html, /<div class="container">/i, /<\/div>\s*<\/body>/i);
  if (!container) {
    throw new Error(`No .container found in ${slug}`);
  }
  container = container.replace(/<div class="container">/i, '');

  // Remove chrome pieces that the new shell provides
  container = container
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
    .replace(/<p>\s*<strong>Last updated:<\/strong>[\s\S]*?<\/p>/i, '')
    .replace(/<h2>\s*Contact Us\s*<\/h2>[\s\S]*?(?=<div class="footer"|$)/i, '')
    .replace(/<div class="footer">[\s\S]*?<\/div>/i, '')
    .replace(/<h2>\s*Children['’]?s Privacy\s*<\/h2>[\s\S]*?(?=<h2>|$)/i, '')
    .replace(/<h2>\s*Security\s*<\/h2>[\s\S]*?(?=<h2>|$)/i, '')
    .replace(/<h2>\s*Your Choices\s*<\/h2>[\s\S]*?(?=<h2>|$)/i, '')
    .trim();

  // Normalize third-party links to open safely
  container = container.replace(
    /<a\s+href="(https?:\/\/[^"]+)"(\s+target="_blank")?(?![^>]*rel=)/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer"'
  );

  const next = buildPrivacyPageShell({
    appName,
    primaryColor,
    lastUpdated,
    bodyHtml: container,
    contactEmailHtml: obfuscateEmail(CONTACT),
    year: new Date().getFullYear(),
    slug,
  });

  fs.writeFileSync(filePath, next, 'utf8');
  return { slug, status: 'upgraded', appName, primaryColor };
}

const dirs = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const results = [];
for (const slug of dirs) {
  const filePath = path.join(ROOT, slug, 'index.html');
  if (!fs.existsSync(filePath)) {
    results.push({ slug, status: 'missing' });
    continue;
  }
  try {
    results.push(upgradeFile(filePath, slug));
    console.log(`✔ ${slug}`);
  } catch (err) {
    results.push({ slug, status: 'error', error: err.message });
    console.warn(`✖ ${slug}: ${err.message}`);
  }
}

console.log(JSON.stringify({ root: ROOT, results }, null, 2));
