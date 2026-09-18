/**
 * Classify AdMob/RC config status without printing secret values.
 * Usage: node scripts/classify-monetization.mjs
 */
import fs from 'fs';
import path from 'path';

const TEST_PUB = '3940256099942544';
const PLACEHOLDER = /your_|YOUR_|dummy|XXXXXXXX|placeholder|changeme/i;

function walk(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (
      !e.isDirectory() ||
      ['node_modules', '.git', '.expo', 'android', 'ios', 'build'].includes(e.name) ||
      e.name.includes('-auth')
    ) {
      continue;
    }
    const full = path.join(dir, e.name);
    if (fs.existsSync(path.join(full, 'package.json'))) {
      out.push(full);
      continue;
    }
    walk(full, depth + 1, out);
  }
  return out;
}

function classify(val) {
  if (!val || !String(val).trim()) return 'missing';
  const v = String(val).trim().replace(/^['"]|['"]$/g, '');
  if (PLACEHOLDER.test(v)) return 'placeholder';
  if (v.includes(TEST_PUB)) return 'test';
  if (/^ca-app-pub-/.test(v) || /^goog_/.test(v) || /^appl_/.test(v)) return 'production-looking';
  return 'set';
}

function parseEnv(fp) {
  const map = {};
  if (!fs.existsSync(fp)) return map;
  for (const line of fs.readFileSync(fp, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return map;
}

const root = process.env.PROJECTS_ROOT || 'D:/Projects/RN/published';
for (const a of walk(root)) {
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(a, 'package.json'), 'utf8'));
  } catch {}
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const usesAdmob = !!deps['react-native-google-mobile-ads'];
  const usesRc = !!deps['react-native-purchases'];
  if (!usesAdmob && !usesRc) continue;

  const env = parseEnv(path.join(a, '.env'));
  const envKeys = Object.keys(env).filter((k) => /ADMOB|REVENUECAT|AD_UNIT/i.test(k));
  const statuses = envKeys.map((k) => `${k}:${classify(env[k])}`);

  let appIdStatus = 'n/a';
  for (const f of ['app.json', 'app.config.js', 'app.config.ts']) {
    const fp = path.join(a, f);
    if (!fs.existsSync(fp)) continue;
    const t = fs.readFileSync(fp, 'utf8');
    const idMatch = t.match(/ca-app-pub-[0-9]+~[0-9]+/);
    if (idMatch) appIdStatus = classify(idMatch[0]);
  }

  console.log(
    path.relative(root, a).padEnd(36),
    `admob=${usesAdmob ? 'Y' : 'N'}`,
    `rc=${usesRc ? 'Y' : 'N'}`,
    `appId=${appIdStatus}`,
    `env=[${statuses.join(', ')}]`
  );
}
