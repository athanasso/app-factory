# App Factory

AI-assisted React Native → Google Play automation: scan local apps, generate ASO copy, build/reuse AABs, upload via Play Developer API v3, sync privacy pages, and run Personal-account 14-day closed testing with [TheClosedTest](https://github.com/neerajlovecyber/TheClosedTest-apk).

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Play API](https://img.shields.io/badge/Play_API-v3-00B2FF?logo=googleplay&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-AI-8E75B2?logo=google&logoColor=white)

---

## Overview

App Factory connects a folder of React Native projects (`PROJECTS_ROOT`) to:

- **Google Gemini** — titles, listings, translations, changelogs  
- **Play Developer API v3** — AAB upload, listings, tracks, testers, overview  
- **Local Gradle** — `bundleRelease` when no AAB exists (reuses existing `.aab` otherwise)  
- **ADB + TheClosedTest** — Personal-account 14-day / 12-tester peer swaps from a signed-in phone  

Dashboard: Vite React UI + Express API (`:3001`) with live WebSocket progress.

---

## Features

### Pipeline & AutoPublish
- Deep-scan nested RN apps under `PROJECTS_ROOT`
- Full first-upload pipeline: research → assets → AAB → Play upload
- **Reuses existing release AABs** — does not rebuild unless missing or RevenueCat second upload
- AutoPublish only queues **first upload**, **RC second upload**, or a newer AAB than last upload (no churn on already-live apps)
- Play track sync sets **Published** when production exists; clears stale **Updating** after crashed jobs
- Windows-safe `apps.json` writes (copy overwrite, no fragile `rename`)

### Store listing & privacy
- Harvest contact email / website / tester Google Groups from existing Play apps
- Privacy HTML under portfolio: `https://athanasopoulos.is-a.dev/privacy-policy/{slug}/`
- Niche ASO titles (blocks generic junk like “Smart Daily Tool”)
- Screenshots / feature graphics via Expo web + Chrome (system Chrome if Puppeteer cache missing)

### Personal account closed testing
- Seeds `developers-community-official@googlegroups.com` on closed tracks
- **TheClosedTest** panel (Personal accounts, apps not in production):
  - **Run full cycle** — register app (skip if exists), request unique swaps, accept inbound, save partners  
  - **Daily ADB proofs** — open partner apps → screenshot → gallery / upload path  
  - Uses the **signed-in phone session over ADB** (no JWT required; optional Clerk JWT for faster REST)
- Unique partners tracked globally so the same ClosedTest user/package is not reused across your apps

### Monetization
- Play IAP / subscription catalog via API v3  
- Optional AdMob reporting (needs SA permissions)  
- Optional GCS earnings bucket config  

---

## Architecture

```
app-factory/
├── data/                         # gitignored runtime state
│   ├── apps.json
│   ├── credentials/              # publisher-defaults, monetization, closed-test
│   ├── apps_content/             # listings, media, submission records
│   └── closed_test/              # exchange state + daily proof screenshots
├── server/
│   ├── db/store.js               # scan, status, crash-safe save, track sync
│   ├── services/
│   │   ├── autoPublish.js        # scheduled first/second upload only
│   │   ├── build.js              # Gradle AAB (skip if exists)
│   │   ├── closedTestExchange.js # ADB + optional API closed-test cycle
│   │   ├── closedTestApi.js      # TheClosedTest REST client
│   │   ├── media.js              # screenshots / feature graphic (system Chrome)
│   │   ├── privacyPolicy*.js     # portfolio privacy HTML
│   │   ├── publisherDefaults.js  # harvest overview + testers
│   │   ├── queue.js / submission.js / playConsole.js / …
│   └── index.js
└── src/                          # Vite dashboard
```

---

## Setup

### Prerequisites
- Node.js 18+
- JDK 17+ / Android SDK (for Gradle builds)
- Google Play service account JSON with app access
- Gemini API key
- Optional: USB-debugging phone with TheClosedTest installed & signed in

### Environment (`.env`)

```env
PORT=3001
GEMINI_API_KEY=...
PROJECTS_ROOT=D:/Projects/RN/published
PLAY_CONSOLE_KEY_PATH=service-account.json

# Optional privacy / portfolio
PRIVACY_POLICIES_PORTFOLIO_ROOT=D:/Projects/Next js/next-portfolio/public/privacy-policy
PRIVACY_POLICY_URL_TEMPLATE=https://athanasopoulos.is-a.dev/privacy-policy/{slug}/
```

### Monetization (optional)

Copy `monetization.example.json` → `data/credentials/monetization.json`.

### Service account
1. Create a GCP service account; enable **Google Play Android Developer API**  
2. In Play Console → Users & permissions → invite the SA email with release + app access  
3. Save the key as `service-account.json` (or path in `PLAY_CONSOLE_KEY_PATH`)

---

## Run

```bash
npm install
npm run server    # API + WebSocket :3001
npm run dev       # UI :5173
```

Open `http://localhost:5173`.

Settings → set **Personal** vs **Organization**, projects root, and auto-upload. For closed testing, connect a phone (`adb devices`) with TheClosedTest logged in.

---

## API (high level)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/apps` | Apps + stats |
| POST | `/api/apps/sync-tracks` | Refresh production/alpha detection |
| POST | `/api/apps/reconcile-status` | Clear stuck Updating badges |
| POST | `/api/apps/:id/pipeline/run` | Start pipeline (`first_upload` / `update` / `second_upload`) |
| POST | `/api/publish/auto` | Drain AutoPublish queue |
| GET/POST | `/api/apps/:id/testing/*` | 14-day tester card status / enroll / promote |
| GET | `/api/closed-test` | ClosedTest exchange status |
| POST | `/api/apps/:id/closed-test/full-cycle` | Register + unique swaps (ADB/API) |
| POST | `/api/closed-test/daily-proofs` | Daily partner screenshots + upload |
| POST | `/api/privacy-policies/sync-urls` | Sync portfolio privacy URLs into listings |
| WS | `ws://localhost:3001/ws` | Live pipeline events |

---

## Notes

- **New Play apps** must be created once in Play Console (API cannot create the package shell). After that, factory uploads AABs and syncs overview/listings.  
- **Personal accounts** need 14 days × ≥12 testers before production; Organization accounts can go direct.  
- AutoPublish will not keep re-uploading apps that already have a successful binary / production track. Use **Run Pipeline** manually for intentional updates.  

---

## License

Proprietary factory tooling. Automated Play submissions must comply with [Google Play Developer Program Policies](https://play.google.com/about/developer-content-policy/).
