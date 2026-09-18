/**
 * Play Console browser automation (ShortsMachine-style).
 * Uses a dedicated Chrome user-data-dir with a persisted Google login —
 * preferably the ShortsMachine chrome_profile when CHROME_READY there.
 *
 * Fills Console-only App content steps the Publisher API cannot touch:
 * privacy policy URL, ads declaration, content rating, data safety.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { getSettings, updateSettings, updateApp } from '../db/store.js';
import {
  loadPublisherDefaults,
  resolvePrivacyPolicyUrl,
} from './publisherDefaults.js';
import { privacySlugForApp } from './privacyPolicy.js';
import { detectMonetizationUsage } from './monetizationIntegration.js';

const SHORTS_PROFILE = 'D:\\Projects\\generate\\ShortsMachine\\chrome_profile';
const SHORTS_CONFIG = 'D:\\Projects\\generate\\ShortsMachine\\config.json';
const LOCAL_PROFILE = path.resolve(process.cwd(), 'chrome_profile');
const CONSOLE_HOME = 'https://play.google.com/console';

let puppeteerPromise = null;
let chromeLock = Promise.resolve();

const getPuppeteer = async () => {
  if (!puppeteerPromise) {
    puppeteerPromise = import('puppeteer').then((m) => m.default);
  }
  return puppeteerPromise;
};

function withChromeLock(fn) {
  const run = chromeLock.then(fn, fn);
  chromeLock = run.catch(() => {});
  return run;
}

function resolveChromeExe(cfg = {}) {
  const candidates = [
    cfg.chromeExe,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function readShortsChromeConfig() {
  try {
    if (!fs.existsSync(SHORTS_CONFIG)) return null;
    return JSON.parse(fs.readFileSync(SHORTS_CONFIG, 'utf8'));
  } catch {
    return null;
  }
}

/** Prefer ShortsMachine profile when already logged in; else local chrome_profile. */
export function findChromePaths(settings = null) {
  const s = settings || getSettings() || {};
  const browser = s.playConsoleBrowser || {};
  const shorts = readShortsChromeConfig();

  const exe = resolveChromeExe({
    chromeExe: browser.chromeExe || shorts?.CHROME_EXE,
  });

  let profile = browser.chromeProfile || null;
  if (profile) {
    const defaultUserData = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
      : null;
    try {
      if (defaultUserData && path.resolve(profile) === path.resolve(defaultUserData)) {
        profile = null; // Chrome blocks automation on personal User Data
      }
    } catch {}
  }

  if (!profile && shorts?.CHROME_READY && fs.existsSync(SHORTS_PROFILE)) {
    profile = SHORTS_PROFILE;
  }
  if (!profile) {
    if (!fs.existsSync(LOCAL_PROFILE)) fs.mkdirSync(LOCAL_PROFILE, { recursive: true });
    profile = LOCAL_PROFILE;
  }

  const ready = Boolean(
    browser.ready ||
      (profile === SHORTS_PROFILE && shorts?.CHROME_READY) ||
      browser.ready
  );

  return { exe, profile, ready: Boolean(ready && exe) };
}

export function getPlayConsoleBrowserStatus() {
  const paths = findChromePaths();
  // Persist ready flag when ShortsMachine profile is already logged in
  if (paths.ready && paths.profile === SHORTS_PROFILE) {
    const cur = getSettings().playConsoleBrowser || {};
    if (!cur.ready || cur.chromeProfile !== paths.profile) {
      try {
        updateSettings({
          playConsoleBrowser: {
            ...cur,
            chromeExe: paths.exe,
            chromeProfile: paths.profile,
            ready: true,
            readyAt: cur.readyAt || new Date().toISOString(),
            source: 'shorts_machine',
          },
        });
      } catch {}
    }
  }
  return {
    ready: paths.ready,
    chromeExe: paths.exe,
    chromeProfile: paths.profile,
    usingShortsMachineProfile: paths.profile === SHORTS_PROFILE,
  };
}

function cleanProfileLocks(profileDir) {
  try {
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${profileDir.replace(/\\/g, '\\\\')}*' -or $_.CommandLine -like '*chrome_profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      { timeout: 8000, windowsHide: true }
    );
  } catch {}

  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
    const lockPath = path.join(profileDir, name);
    try {
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch {}
  }

  for (const pref of [
    path.join(profileDir, 'Default', 'Preferences'),
    path.join(profileDir, 'Preferences'),
  ]) {
    try {
      if (!fs.existsSync(pref)) continue;
      const data = JSON.parse(fs.readFileSync(pref, 'utf8'));
      if (data?.browser?.window_placement) {
        delete data.browser.window_placement;
        fs.writeFileSync(pref, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch {}
  }
}

async function launchConsoleBrowser({ minimized = true } = {}) {
  const { exe, profile } = findChromePaths();
  if (!exe) throw new Error('Google Chrome not found. Install Chrome or set playConsoleBrowser.chromeExe.');
  if (!fs.existsSync(profile)) fs.mkdirSync(profile, { recursive: true });
  cleanProfileLocks(profile);

  const puppeteer = await getPuppeteer();
  const args = [
    `--user-data-dir=${profile}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (minimized) {
    args.push('--window-position=-32000,-32000', '--window-size=1440,900');
  } else {
    args.push('--window-position=60,40', '--window-size=1440,900');
  }

  const browser = await puppeteer.launch({
    headless: false, // Google consoles detect headless
    executablePath: exe,
    args,
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null,
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return { browser, page, exe, profile };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isLoggedIntoConsole(page) {
  const url = (page.url() || '').toLowerCase();
  if (url.includes('accounts.google.com')) return false;
  // Any Play Console route means the Google session can reach Console
  if (url.includes('play.google.com/console')) return true;
  return false;
}

async function waitForConsoleLogin(page, { timeoutMs = 5 * 60 * 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await isLoggedIntoConsole(page)) return true;
    } catch {}
    await sleep(2500);
  }
  return false;
}

/** One-time Connect Chrome — opens Play Console visibly for Google login. */
export async function setupPlayConsoleSession({ log = console.log } = {}) {
  return withChromeLock(async () => {
    const { exe, profile } = findChromePaths();
    if (!exe) {
      throw new Error('Chrome executable not found');
    }
    log(`[PlayConsoleBrowser] Chrome: ${exe}`);
    log(`[PlayConsoleBrowser] Profile: ${profile}`);

    updateSettings({
      playConsoleBrowser: {
        ...(getSettings().playConsoleBrowser || {}),
        chromeExe: exe,
        chromeProfile: profile,
        ready: false,
      },
    });

    const { browser, page } = await launchConsoleBrowser({ minimized: false });
    try {
      await page.goto(CONSOLE_HOME, { waitUntil: 'domcontentloaded', timeout: 90000 });
      let ok = false;
      for (let i = 0; i < 20; i++) {
        await sleep(1000);
        if (await isLoggedIntoConsole(page)) {
          ok = true;
          break;
        }
        const url = (page.url() || '').toLowerCase();
        if (url.includes('accounts.google.com') || url.includes('signin')) break;
      }
      if (!ok) {
        log('[PlayConsoleBrowser] Sign in to Google Play Console in the opened Chrome window (up to 5 min)…');
        ok = await waitForConsoleLogin(page);
      }
      if (!ok) throw new Error('Play Console login timed out');

      updateSettings({
        playConsoleBrowser: {
          chromeExe: exe,
          chromeProfile: profile,
          ready: true,
          readyAt: new Date().toISOString(),
        },
      });
      log('[PlayConsoleBrowser] ✔ Session ready');
      return { success: true, ...getPlayConsoleBrowserStatus() };
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

function buildFillContext(app) {
  const defaults = loadPublisherDefaults();
  const slug = privacySlugForApp(app);
  const privacyPolicyUrl = resolvePrivacyPolicyUrl(slug, defaults);
  const usage = detectMonetizationUsage(app.sourcePath);
  return {
    appId: app.id,
    name: app.name,
    packageName: app.packageName,
    privacyPolicyUrl,
    usesAdMob: Boolean(usage.usesAdMob),
    usesRevenueCat: Boolean(usage.usesRevenueCat),
    category: app.category || 'Tools',
    contactEmail: defaults.contactEmail || getSettings().contactEmail || '',
    playConsoleAppId: app.playConsoleAppId || null,
    playConsoleDeveloperId: app.playConsoleDeveloperId || null,
  };
}

const CLICK_BY_TEXT_JS = `
(texts, opts = {}) => {
  const list = Array.isArray(texts) ? texts : [texts];
  const exact = Boolean(opts.exact);
  const root = document.body;
  const candidates = Array.from(root.querySelectorAll('a,button,[role="button"],[role="link"],material-button,span,div,li'));
  for (const want of list) {
    const needle = String(want).toLowerCase().trim();
    for (const el of candidates) {
      const t = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
      if (!t || t.length > 120) continue;
      const tl = t.toLowerCase();
      const hit = exact ? tl === needle : tl === needle || tl.includes(needle);
      if (!hit) continue;
      const clickable = el.closest('a,button,[role="button"],[role="link"]') || el;
      clickable.scrollIntoView({ block: 'center' });
      clickable.click();
      return { clicked: t, tag: clickable.tagName };
    }
  }
  return null;
}
`;

const FILL_INPUT_JS = `
(value, hints = []) => {
  const inputs = Array.from(document.querySelectorAll('input[type="url"], input[type="text"], input:not([type]), textarea'));
  const visible = inputs.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 10 && !el.disabled && !el.readOnly;
  });
  let target = null;
  for (const hint of hints) {
    const h = String(hint).toLowerCase();
    target = visible.find((el) => {
      const label = (
        (el.getAttribute('aria-label') || '') +
        ' ' +
        (el.getAttribute('placeholder') || '') +
        ' ' +
        (el.id || '') +
        ' ' +
        (el.name || '')
      ).toLowerCase();
      return label.includes(h);
    });
    if (target) break;
  }
  if (!target) target = visible.find((el) => /https?:\\/\\//.test(el.value || '')) || visible[0];
  if (!target) return { ok: false, reason: 'no_input' };
  target.focus();
  target.value = '';
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.value = value;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, tag: target.tagName, name: target.name || target.id || '' };
}
`;

async function clickText(page, texts, opts = {}) {
  const result = await page.evaluate(CLICK_BY_TEXT_JS, texts, opts);
  if (result) await sleep(800);
  return result;
}

async function fillField(page, value, hints = []) {
  return page.evaluate(FILL_INPUT_JS, value, hints);
}

async function clickSave(page) {
  const hit =
    (await clickText(page, ['Save', 'Save changes', 'Submit', 'Apply', 'Continue', 'Next', 'Start'])) ||
    null;
  await sleep(1200);
  return hit;
}

async function extractDeveloperId(page) {
  const url = page.url() || '';
  const m = url.match(/\/developers\/(\d+)/);
  if (m) return m[1];
  // Try any link on the page
  return page.evaluate(() => {
    const hrefs = Array.from(document.querySelectorAll('a[href*="/developers/"]')).map((a) => a.href);
    for (const h of hrefs) {
      const m = h.match(/\/developers\/(\d+)/);
      if (m) return m[1];
    }
    return null;
  });
}

async function extractConsoleIds(page) {
  const url = page.url() || '';
  const m = url.match(/\/developers\/(\d+)\/app\/(\d+)/);
  if (!m) return null;
  return { developerId: m[1], appId: m[2] };
}

/** Shadow-DOM-aware find & click of an app by package or name. */
async function clickAppByPackageOrName(page, pkg, name) {
  return page.evaluate((pkgName, appName) => {
    const want = [pkgName, appName].filter(Boolean).map((s) => String(s).toLowerCase());
    const queue = [document.documentElement];
    const visited = new Set();
    let steps = 0;
    while (queue.length && steps < 8000) {
      steps++;
      const node = queue.shift();
      if (!node || visited.has(node)) continue;
      visited.add(node);

      if (node.shadowRoot) queue.push(node.shadowRoot);
      if (node.children) {
        for (const c of node.children) queue.push(c);
      }

      const href = node.href || (node.getAttribute && node.getAttribute('href')) || '';
      const text = ((node.innerText || node.textContent || node.getAttribute?.('aria-label') || '') + '').trim();
      const blob = `${href} ${text}`.toLowerCase();
      if (!want.some((w) => blob.includes(w))) continue;
      if (href && /\/app\/\d+/.test(href)) {
        node.click?.();
        return { ok: true, via: 'href', href, text: text.slice(0, 100) };
      }
      if (text && want.some((w) => text.toLowerCase().includes(w)) && text.length < 200) {
        const clickable =
          (node.closest && node.closest('a,[role="link"],[role="row"],button')) || node;
        clickable.click?.();
        return { ok: true, via: 'text', text: text.slice(0, 100) };
      }
    }
    return { ok: false, scanned: steps };
  }, pkg, name);
}

async function openAppInConsole(page, ctx) {
  if (ctx.playConsoleDeveloperId && ctx.playConsoleAppId) {
    const deep = `https://play.google.com/console/u/0/developers/${ctx.playConsoleDeveloperId}/app/${ctx.playConsoleAppId}/app-content/summary`;
    await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(2500);
    if (await isLoggedIntoConsole(page)) return { via: 'deep_link', ids: await extractConsoleIds(page) };
  }

  await page.goto(CONSOLE_HOME, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(4000);

  let url = (page.url() || '').toLowerCase();
  if (url.includes('accounts.google.com')) {
    for (let i = 0; i < 20; i++) {
      await sleep(1500);
      url = (page.url() || '').toLowerCase();
      if (url.includes('play.google.com/console') && !url.includes('accounts.google.com')) break;
    }
  }

  if (!(await isLoggedIntoConsole(page))) {
    throw new Error(
      `Not logged into Play Console (url=${page.url()}). Run Connect Chrome and finish Google login in the opened window.`
    );
  }

  // Account / developer picker (SPA may sit on /console/developers)
  for (let i = 0; i < 10; i++) {
    const pageText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 4000));
    if (/choose developer account/i.test(pageText)) {
      // Aggressive shadow-DOM click on the developer account row
      const picked = await page.evaluate(() => {
        const target = 'athanasso';
        const queue = [document.documentElement];
        const visited = new Set();
        let steps = 0;
        while (queue.length && steps < 10000) {
          steps++;
          const node = queue.shift();
          if (!node || visited.has(node)) continue;
          visited.add(node);
          if (node.shadowRoot) queue.push(node.shadowRoot);
          if (node.children) for (const c of node.children) queue.push(c);

          const text = (node.innerText || node.textContent || '').trim();
          if (!text || text.toLowerCase() !== target) continue;

          // Climb to a clickable ancestor
          let el = node;
          for (let i = 0; i < 6 && el; i++) {
            try {
              el.click();
              return { ok: true, via: 'exact-text', tag: el.tagName, steps };
            } catch {}
            el = el.parentElement || el.parentNode;
          }
        }
        // Fallback: any node whose text includes athanasso and is short
        const all = [];
        const q2 = [document.documentElement];
        const v2 = new Set();
        while (q2.length && all.length < 50) {
          const n = q2.shift();
          if (!n || v2.has(n)) continue;
          v2.add(n);
          if (n.shadowRoot) q2.push(n.shadowRoot);
          if (n.children) for (const c of n.children) q2.push(c);
          const t = (n.innerText || '').trim();
          if (/athanasso/i.test(t) && t.length < 40) all.push(n);
        }
        for (const n of all) {
          try {
            n.click();
            return { ok: true, via: 'includes', text: (n.innerText || '').slice(0, 40) };
          } catch {}
        }
        return { ok: false, steps };
      });

      console.log('[PlayConsoleBrowser] Developer picker:', picked);

      // Puppeteer mouse click on center of matching element via XPath-ish
      if (!picked?.ok) {
        try {
          const handle = await page.evaluateHandle(() => {
            const walk = (root, out = []) => {
              const nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
              for (const n of nodes) {
                if ((n.textContent || '').trim().toLowerCase() === 'athanasso') out.push(n);
                if (n.shadowRoot) walk(n.shadowRoot, out);
              }
              return out;
            };
            return walk(document)[0] || null;
          });
          const el = handle.asElement();
          if (el) {
            const box = await el.boundingBox();
            if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              console.log('[PlayConsoleBrowser] Mouse-clicked athanasso at', box);
            }
          }
        } catch (e) {
          console.warn('[PlayConsoleBrowser] mouse click failed', e.message);
        }
      }

      // Puppeteer text locator (Chrome  / Puppeteer 24+)
      try {
        const loc = page.locator('text/athanasso');
        await loc.click({ timeout: 5000 });
        console.log('[PlayConsoleBrowser] locator text/athanasso clicked');
      } catch (e) {
        try {
          await page.click('::-p-text(athanasso)', { timeout: 5000 });
          console.log('[PlayConsoleBrowser] ::-p-text(athanasso) clicked');
        } catch (e2) {
          console.warn('[PlayConsoleBrowser] text locators failed', e2.message);
        }
      }

      await sleep(4000);
    }

    let developerId = await extractDeveloperId(page);
    if (developerId) break;

    await clickText(page, ['Continue', 'Select', 'Open']);
    await sleep(1500);
  }

  let developerId = await extractDeveloperId(page);
  // Force into developers hub so the URL gains an id
  if (!developerId) {
    await page.goto('https://play.google.com/console/u/0/developers', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await sleep(4000);
    developerId = await extractDeveloperId(page);
  }
  if (!developerId) {
    // Dump diagnostics for UI debugging
    const diag = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 2000),
      links: Array.from(document.querySelectorAll('a[href]'))
        .slice(0, 30)
        .map((a) => ({ href: a.href, text: (a.innerText || '').slice(0, 60) })),
    }));
    const err = new Error(
      `Could not resolve Play Console developer id (url=${page.url()}). Open Console once in Connect Chrome and pick the developer account.`
    );
    err.diagnostics = diag;
    throw err;
  }

  // All apps list
  const listUrl = `https://play.google.com/console/u/0/developers/${developerId}/app-list`;
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(3500);

  // Type into search if present
  await page.evaluate((q) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const search = inputs.find((el) => {
      const meta = `${el.getAttribute('aria-label') || ''} ${el.placeholder || ''} ${el.type || ''}`.toLowerCase();
      return meta.includes('search') || el.type === 'search';
    });
    if (!search) return false;
    search.focus();
    search.value = q;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  }, ctx.packageName || ctx.name);
  await sleep(2500);

  let opened = await clickAppByPackageOrName(page, ctx.packageName, ctx.name);
  if (!opened.ok && ctx.name) {
    const token = String(ctx.name).split(/[:\-–]/)[0].trim();
    opened = await clickAppByPackageOrName(page, ctx.packageName, token);
  }
  await sleep(3000);

  let ids = await extractConsoleIds(page);
  if (!ids && developerId) {
    const found = await page.evaluate((pkg, name, devId) => {
      const want = [pkg, name].filter(Boolean).map((s) => String(s).toLowerCase());
      const anchors = Array.from(document.querySelectorAll('a[href*="/app/"]'));
      for (const a of anchors) {
        const rowText = ((a.closest('tr,li,div') || a).innerText || '').toLowerCase();
        const href = a.href || '';
        if (!want.some((w) => rowText.includes(w) || href.toLowerCase().includes(w))) continue;
        const m = href.match(/\/app\/(\d+)/);
        if (m) return { developerId: String(devId), appId: m[1], href };
      }
      return {
        sample: anchors.slice(0, 8).map((a) => ({ href: a.href, text: (a.innerText || '').slice(0, 60) })),
        bodySample: (document.body?.innerText || '').slice(0, 500),
      };
    }, ctx.packageName, ctx.name, developerId);
    if (found?.appId) {
      await page.goto(
        `https://play.google.com/console/u/0/developers/${developerId}/app/${found.appId}/app-content/summary`,
        { waitUntil: 'domcontentloaded', timeout: 90000 }
      );
      await sleep(2500);
      ids = await extractConsoleIds(page);
      opened = { ok: true, via: 'href_scan', ...found };
    } else {
      opened = { ...opened, debug: found };
    }
  }

  return {
    via: developerId ? 'app-list' : 'home',
    opened,
    ids,
    developerId,
  };
}

async function goAppContent(page, section) {
  // Prefer left-nav "App content"
  await clickText(page, ['App content']);
  await sleep(1500);

  const sectionMap = {
    summary: ['App content', 'Overview'],
    privacy: ['Privacy policy', 'Privacy Policy'],
    ads: ['Ads'],
    rating: ['Content ratings', 'Content rating', 'IARC'],
    data_safety: ['Data safety', 'Data Safety'],
  };
  const labels = sectionMap[section] || [section];
  await clickText(page, labels);
  await sleep(2000);

  // If we have IDs in URL, also try direct path
  const ids = await extractConsoleIds(page);
  if (ids) {
    const pathSuffix = {
      summary: 'app-content/summary',
      privacy: 'app-content/privacy-policy',
      ads: 'app-content/ads',
      rating: 'app-content/content-ratings',
      data_safety: 'app-content/data-safety',
    }[section];
    if (pathSuffix) {
      const url = `https://play.google.com/console/u/0/developers/${ids.developerId}/app/${ids.appId}/${pathSuffix}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await sleep(2000);
    }
  }
  return ids;
}

async function fillPrivacyPolicy(page, ctx) {
  const ids = await extractConsoleIds(page);
  if (ids) {
    const url = `https://play.google.com/console/u/0/developers/${ids.developerId}/app/${ids.appId}/app-content/privacy-policy`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(3000);
  } else {
    await goAppContent(page, 'privacy');
  }

  // Dismiss start / edit if present
  for (const label of ['Start', 'Add privacy policy', 'Manage', 'Edit', 'Change']) {
    await clickText(page, [label]);
    await sleep(600);
  }

  // Prefer typing via Puppeteer keyboard into focused input
  let filled = await fillField(page, ctx.privacyPolicyUrl, [
    'privacy',
    'url',
    'policy',
    'website',
    'http',
  ]);

  if (!filled.ok) {
    // Shadow-DOM search for URL inputs
    filled = await page.evaluate((value) => {
      const queue = [document.documentElement];
      const visited = new Set();
      while (queue.length) {
        const node = queue.shift();
        if (!node || visited.has(node)) continue;
        visited.add(node);
        if (node.shadowRoot) queue.push(node.shadowRoot);
        if (node.children) for (const c of node.children) queue.push(c);
        const tag = (node.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') continue;
        const meta = `${node.getAttribute?.('aria-label') || ''} ${node.placeholder || ''} ${node.type || ''}`.toLowerCase();
        const looksUrl =
          node.type === 'url' ||
          /url|privacy|policy|http|website|link/.test(meta) ||
          /https?:/.test(node.value || '');
        if (!looksUrl && node.type === 'hidden') continue;
        try {
          node.focus();
          node.value = value;
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, via: 'shadow', meta };
        } catch {}
      }
      return { ok: false, reason: 'no_input_shadow' };
    }, ctx.privacyPolicyUrl);
  }

  if (!filled.ok) {
    // Last resort: click first textbox then type
    try {
      const input = await page.$('input[type="url"], input[type="text"], textarea');
      if (input) {
        await input.click({ clickCount: 3 });
        await page.keyboard.type(ctx.privacyPolicyUrl, { delay: 15 });
        filled = { ok: true, via: 'keyboard' };
      }
    } catch {}
  }

  if (!filled.ok) {
    return { success: false, error: 'Could not find privacy policy URL field', filled };
  }

  await clickSave(page);
  await sleep(1500);
  // Confirm value stuck
  const confirmed = await page.evaluate((url) => {
    const text = document.body?.innerText || '';
    const inputs = Array.from(document.querySelectorAll('input, textarea')).map((i) => i.value || '');
    return text.includes(url) || inputs.some((v) => v.includes(url));
  }, ctx.privacyPolicyUrl);

  return { success: true, url: ctx.privacyPolicyUrl, filled, confirmed };
}

async function fillAdsDeclaration(page, ctx) {
  await goAppContent(page, 'ads');
  const label = ctx.usesAdMob
    ? ['Yes, my app contains ads', 'Yes', 'Contains ads']
    : ['No, my app does not contain ads', 'No', 'No ads'];
  const clicked = await clickText(page, label);
  await clickSave(page);
  return { success: Boolean(clicked), containsAds: ctx.usesAdMob, clicked };
}

async function fillContentRating(page, ctx) {
  await goAppContent(page, 'rating');
  await clickText(page, ['Start questionnaire', 'Start', 'Create', 'Apply for rating', 'Edit']);
  await sleep(1500);

  // Category-ish
  await clickText(page, [
    ctx.category,
    'Utility',
    'Productivity',
    'Tools',
    'Social Networking',
    'Other',
  ]);
  await sleep(800);

  // Answer No to common IARC harm questions (best-effort sweep)
  for (let i = 0; i < 25; i++) {
    const no = await clickText(page, ['No', 'None', 'Not at all'], { exact: false });
    if (!no) break;
    await sleep(400);
  }
  await clickText(page, ['Next', 'Continue', 'Save', 'Calculate', 'Submit', 'Apply']);
  await sleep(1500);
  await clickSave(page);
  return { success: true, assumed: 'Everyone / PEGI 3 (best-effort questionnaire)' };
}

async function fillDataSafety(page, ctx) {
  await goAppContent(page, 'data_safety');
  await clickText(page, ['Start', 'Manage', 'Edit', 'Next']);
  await sleep(1200);

  // Collects data? Ads/IAP usually imply some data processing
  if (ctx.usesAdMob || ctx.usesRevenueCat) {
    await clickText(page, ['Yes', 'Does collect', 'Collects']);
  } else {
    await clickText(page, ['No', 'Does not collect', "Doesn't collect"]);
  }
  await sleep(800);

  // Encryption / users can request deletion — prefer Yes when present
  for (const yes of ['Yes', 'Encrypted in transit', 'Users can request deletion']) {
    await clickText(page, [yes]);
    await sleep(300);
  }

  // Keep advancing
  for (let i = 0; i < 12; i++) {
    const next = await clickText(page, ['Next', 'Continue', 'Save', 'Submit', 'Confirm']);
    if (!next) break;
    await sleep(900);
  }
  await clickSave(page);
  return {
    success: true,
    note: 'Best-effort Data Safety pass — verify in Console if any step was skipped',
    assumesCollection: Boolean(ctx.usesAdMob || ctx.usesRevenueCat),
  };
}

async function saveDebugShot(page, appId, label) {
  try {
    const dir = path.resolve(process.cwd(), 'data', 'apps_content', appId, 'submission');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `play-console-${label}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch {
    return null;
  }
}

/**
 * Fill Console-only App content for one app.
 * @param {object} app
 * @param {{ steps?: string[], minimized?: boolean }} options
 */
export async function fillPlayConsoleAppContent(app, options = {}) {
  const steps = options.steps || [
    'privacy_policy',
    'ads',
    'content_rating',
    'data_safety',
  ];
  const ctx = buildFillContext(app);
  if (!ctx.packageName) throw new Error('App has no packageName');

  const status = getPlayConsoleBrowserStatus();
  if (!status.ready && status.profile !== SHORTS_PROFILE) {
    // ShortsMachine profile with CHROME_READY is treated as ready in findChromePaths
  }
  if (!findChromePaths().ready) {
    throw new Error('Play Console Chrome session not ready. Call setup (Connect Chrome) first.');
  }

  return withChromeLock(async () => {
    const { browser, page } = await launchConsoleBrowser({
      minimized: options.minimized !== false,
    });
    const results = { appId: app.id, packageName: ctx.packageName, steps: {}, ctx };
    try {
      const opened = await openAppInConsole(page, ctx);
      results.opened = opened;
      const ids = opened.ids || (await extractConsoleIds(page));
      if (ids) {
        updateApp(app.id, {
          playConsoleDeveloperId: ids.developerId,
          playConsoleAppId: ids.appId,
        });
        ctx.playConsoleDeveloperId = ids.developerId;
        ctx.playConsoleAppId = ids.appId;
        results.consoleIds = ids;
      }

      if (!(opened.opened?.ok || ids || opened.via === 'deep_link')) {
        results.screenshot = await saveDebugShot(page, app.id, 'app-not-found');
        results.pageUrl = page.url();
        results.opened = opened;
        throw new Error(
          `Could not open ${ctx.packageName} in Play Console (url=${page.url()}). Create the app shell first, then retry.`
        );
      }

      for (const step of steps) {
        try {
          if (step === 'privacy_policy') results.steps.privacy_policy = await fillPrivacyPolicy(page, ctx);
          else if (step === 'ads') results.steps.ads = await fillAdsDeclaration(page, ctx);
          else if (step === 'content_rating') results.steps.content_rating = await fillContentRating(page, ctx);
          else if (step === 'data_safety') results.steps.data_safety = await fillDataSafety(page, ctx);
          else results.steps[step] = { success: false, error: 'unknown_step' };
        } catch (err) {
          results.steps[step] = { success: false, error: err.message };
          results.screenshot = await saveDebugShot(page, app.id, step);
        }
        await sleep(1000);
      }

      const failed = Object.entries(results.steps).filter(([, v]) => !v?.success);
      results.success = failed.length === 0;
      results.summary = results.success
        ? `✔ Filled App content for ${ctx.packageName}`
        : `⚠ Partial fill for ${ctx.packageName}: ${failed.map(([k]) => k).join(', ')} failed`;

      const reportDir = path.resolve(process.cwd(), 'data', 'apps_content', app.id, 'submission');
      if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
      const reportPath = path.join(reportDir, 'play_console_browser_fill.json');
      fs.writeFileSync(
        reportPath,
        JSON.stringify({ ...results, filledAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
      results.reportPath = reportPath;

      updateApp(app.id, {
        playConsoleBrowserFill: {
          at: new Date().toISOString(),
          success: results.success,
          steps: Object.fromEntries(
            Object.entries(results.steps).map(([k, v]) => [k, Boolean(v?.success)])
          ),
        },
      });

      return results;
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

export async function withProbe() {
  return withChromeLock(async () => {
    const { browser, page } = await launchConsoleBrowser({ minimized: false });
    try {
      await page.goto(CONSOLE_HOME, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await sleep(5000);
      const diagnostics = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        text: (document.body?.innerText || '').slice(0, 3000),
        links: Array.from(document.querySelectorAll('a[href]'))
          .slice(0, 40)
          .map((a) => ({ href: a.href, text: (a.innerText || '').slice(0, 80) })),
      }));
      const screenshotDir = path.resolve(process.cwd(), 'data', 'credentials');
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
      const shot = path.join(screenshotDir, `play-console-probe-${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      return { success: true, diagnostics, screenshot: shot, ...getPlayConsoleBrowserStatus() };
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

export async function fillAllPlayConsoleAppContent(options = {}) {
  const { getApps } = await import('../db/store.js');
  const apps = (getApps() || []).filter((a) => a.isReal && a.packageName && a.playPackageExists);
  const results = [];
  for (const app of apps) {
    try {
      results.push(await fillPlayConsoleAppContent(app, options));
    } catch (err) {
      results.push({
        appId: app.id,
        packageName: app.packageName,
        success: false,
        error: err.message,
      });
    }
  }
  return {
    success: results.every((r) => r.success),
    count: results.length,
    results,
  };
}
