/**
 * Shared improved privacy-policy page chrome for Athanasso apps on the portfolio.
 * Used by App Factory generation and the one-shot upgrade script.
 */
export function buildPrivacyPageShell({
  appName,
  primaryColor = '#2563eb',
  lastUpdated,
  bodyHtml,
  contactEmailHtml,
  year = new Date().getFullYear(),
  slug = '',
}) {
  const site = 'https://athanasopoulos.is-a.dev';
  const canonical = slug ? `${site}/privacy-policy/${slug}/` : `${site}/privacy-policy/`;
  const safeName = escapeHtml(appName);
  const updated =
    lastUpdated ||
    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — ${safeName} | Athanasso</title>
  <meta name="description" content="Privacy Policy for the ${safeName} Android app by Athanasso (Emmanouil Athanasopoulos)." />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="Privacy Policy — ${safeName}" />
  <meta property="og:description" content="How ${safeName} handles data, permissions, and third-party services." />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:type" content="website" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --accent: ${primaryColor};
      --ink: #0f172a;
      --muted: #475569;
      --line: rgba(15, 23, 42, 0.08);
      --card: rgba(255, 255, 255, 0.86);
      --bg1: #f8fafc;
      --bg2: #eef2ff;
      --footer: #94a3b8;
      --nav: rgba(15, 23, 42, 0.72);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --ink: #f1f5f9;
        --muted: #94a3b8;
        --line: rgba(148, 163, 184, 0.18);
        --card: rgba(15, 23, 42, 0.78);
        --bg1: #020617;
        --bg2: #0f172a;
        --footer: #64748b;
        --nav: rgba(226, 232, 240, 0.72);
      }
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Outfit, system-ui, sans-serif;
      color: var(--ink);
      line-height: 1.7;
      background:
        radial-gradient(1200px 600px at 10% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%),
        radial-gradient(900px 500px at 100% 0%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 55%),
        linear-gradient(180deg, var(--bg1), var(--bg2));
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      backdrop-filter: blur(12px);
      background: color-mix(in srgb, var(--bg1) 72%, transparent);
      border-bottom: 1px solid var(--line);
    }
    .topbar-inner {
      max-width: 820px;
      margin: 0 auto;
      padding: 0.85rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .brand {
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--nav);
      text-decoration: none;
    }
    .brand:hover { color: var(--accent); text-decoration: none; }
    .top-links {
      display: flex;
      gap: 1rem;
      font-size: 0.9rem;
    }
    .top-links a { color: var(--nav); text-decoration: none; }
    .top-links a:hover { color: var(--accent); }
    main {
      max-width: 820px;
      margin: 0 auto;
      padding: 1.5rem 1.25rem 3rem;
    }
    article {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: clamp(1.5rem, 4vw, 2.75rem);
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
      backdrop-filter: blur(8px);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 0.85rem;
    }
    .eyebrow::before {
      content: "";
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);
    }
    h1 {
      margin: 0 0 0.6rem;
      font-size: clamp(1.85rem, 4vw, 2.6rem);
      line-height: 1.15;
      letter-spacing: -0.03em;
    }
    .meta {
      margin: 0 0 1.75rem;
      color: var(--muted);
      font-size: 0.95rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--line);
    }
    h2 {
      margin: 2rem 0 0.75rem;
      font-size: 1.25rem;
      letter-spacing: -0.02em;
      color: var(--ink);
    }
    h2::before {
      content: "";
      display: inline-block;
      width: 0.35rem;
      height: 1.05em;
      margin-right: 0.55rem;
      border-radius: 999px;
      background: var(--accent);
      vertical-align: -0.15em;
    }
    h3 {
      margin: 1.35rem 0 0.55rem;
      font-size: 1.02rem;
      color: var(--ink);
    }
    p, li { color: var(--muted); }
    p { margin: 0 0 1rem; }
    ul {
      margin: 0 0 1rem;
      padding-left: 1.2rem;
    }
    li { margin-bottom: 0.45rem; }
    li strong { color: var(--ink); font-weight: 600; }
    .panel {
      margin: 1.25rem 0;
      padding: 1rem 1.1rem;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
      background: color-mix(in srgb, var(--accent) 8%, transparent);
    }
    .panel p:last-child { margin-bottom: 0; }
    .contact-box {
      margin-top: 1rem;
      padding: 1rem 1.15rem;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--bg1) 55%, transparent);
    }
    .contact-box ul { margin: 0.4rem 0 0; }
    footer.site-foot {
      max-width: 820px;
      margin: 0 auto;
      padding: 0 1.25rem 2.5rem;
      text-align: center;
      color: var(--footer);
      font-size: 0.88rem;
    }
    footer.site-foot a { color: inherit; }
    @media (max-width: 640px) {
      .top-links .hide-sm { display: none; }
      article { border-radius: 16px; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="${site}/">Athanasso</a>
      <nav class="top-links" aria-label="Secondary">
        <a class="hide-sm" href="${site}/projects">Projects</a>
        <a href="${site}/privacy-policy">Site privacy</a>
        <a href="${site}/contact">Contact</a>
      </nav>
    </div>
  </header>

  <main>
    <article>
      <div class="eyebrow">App privacy policy</div>
      <h1>Privacy Policy for ${safeName}</h1>
      <p class="meta"><strong>Last updated:</strong> ${escapeHtml(updated)} · Developer: Athanasso</p>
      ${bodyHtml}
      <h2>Children&apos;s Privacy</h2>
      <div class="panel">
        <p>Our Service is not directed to anyone under the age of 13. We do not knowingly collect personally identifiable information from children under 13. If you believe a child has provided us personal data, contact us and we will delete it.</p>
      </div>
      <h2>Security</h2>
      <p>We use commercially reasonable safeguards for any systems we operate. Because much of ${safeName}&apos;s data stays on your device, uninstalling the App or clearing its storage removes that local information.</p>
      <h2>Your Choices</h2>
      <ul>
        <li>Revoke permissions anytime in your device settings.</li>
        <li>Opt out of personalized ads via your Google account / device ad settings when AdMob is used.</li>
        <li>Delete local App data by clearing storage or uninstalling.</li>
      </ul>
      <h2>Contact Us</h2>
      <p>Questions about this Privacy Policy or ${safeName}? Reach Athanasso here:</p>
      <div class="contact-box">
        <ul>
          <li>Email: <strong>${contactEmailHtml || 'manos.athanasopoulos99@gmail.com'}</strong></li>
          <li>Website: <a href="${site}/">${site.replace('https://', '')}</a></li>
        </ul>
      </div>
    </article>
  </main>

  <footer class="site-foot">
    &copy; ${year} Athanasso (${safeName}). All rights reserved.
    · <a href="${site}/">athanasopoulos.is-a.dev</a>
  </footer>
</body>
</html>
`;
}

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function obfuscateEmail(email) {
  return String(email || '')
    .split('')
    .map((ch) => `&#${ch.charCodeAt(0)};`)
    .join('');
}
