# 🏭 App Factory
**An Industrial-Grade, AI-Driven React Native Application Development & Google Play Automation Engine**

![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Google Play API v3](https://img.shields.io/badge/Google_Play_API-v3-00B2FF?style=for-the-badge&logo=googleplay&logoColor=white)
![Google Gemini AI](https://img.shields.io/badge/Google_Gemini-Powered-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![WebSockets](https://img.shields.io/badge/Real--time-WebSockets-FF6600?style=for-the-badge)

---

## 🌟 Overview

**App Factory** is an end-to-end orchestration command center designed to automate the entire lifecycle of React Native applications—from concept generation and App Store Optimization (ASO) to Android App Bundle (`.aab`) verification, live Google Play Console billing telemetry, and real-time dashboard analytics.

By bridging your local React Native codebases (`PROJECTS_ROOT`) with **Google Gemini AI** and the **Google Play Developer API v3**, App Factory allows developers to scale, publish, and monitor dozens of production titles seamlessly from a unified dark-mode glassmorphism dashboard.

---

## ✨ Core Capabilities

### 1. 🤖 Automated AI Synthesis & ASO Pipeline
- **Deep Gemini AI Integration**: Uses Google Gemini (`gemini-flash-latest`) to generate tailored App Store listings, high-conversion titles, keywords, short & full promotional descriptions (up to 3,850 chars), and eye-catching slogans.
- **Global Localization Engine**: Streams translation transcreation batches into **49 major global Play Store markets** in real time, persisting all structured listings directly to your file system (`data/apps_content/<id>/locales/`).
- **AI Changelogs**: Automatically composes feature changelogs (`What's New`) and release notes for upcoming version releases.

### 2. 📂 Local File-System Discovery & Codebase Verification
- **Automatic RN Project Scanners**: Continually scans your published codebases directory (default: `D:/Projects/RN/published` or configured via `PROJECTS_ROOT`).
- **Deep Application ID Parsing**: Aggressively extracts authentic Android Package IDs (e.g., `com.athanasso.doomscrolldetox`) directly from native configs (`app.json`, `app.config.js`, `AndroidManifest.xml`, and `build.gradle.kts`).
- **Physical Asset Extraction**: Automatically searches asset hierarchies (`/assets`, `/mipmap`, `/drawable`) to locate and mount physical high-resolution application PNG icons onto the frontend dashboard.
- **Codebase Integrity Audits**: Validates package dependencies (`package.json`), native `/android` build structures, and active `/node_modules`.

### 3. 🔨 Gradle Build & Keystore Auditing
- **Release Keystore Inspection**: Recursively searches `/android` build folders for cryptographically secure release keystores (`*.keystore`, `*.jks`, `*.p12`) and logs exact aliases and modification timestamps.
- **Android App Bundle (AAB) Verification**: Inspects native Gradle output directories (`/android/app/build/outputs/bundle/release/`) for pre-compiled production release binaries (`.aab`) and computes their precise file footprints.

### 4. 💰 Live Monetization Engine & Play Console Direct Sync (API v3)
- **Direct Play Store Billing**: Purged all third-party RevenueCat dependencies. Live auto-renewing subscriptions, billing durations (`/ mo`, `/ yr`), and prices are parsed directly from Google Play Developer API v3 (`monetization.subscriptions.list`).
- **Google Cloud Storage Financial Reports**: Supports connecting Google Play's automated CSV sales reports via Cloud Storage buckets (`googlePlay.reportBucket` in `data/credentials/monetization.json`) for downloading daily & monthly transaction dollar earnings.
- **Catalog Baseline & Manual Sales Preservation**: Automatically computes baseline catalog subscription MRR across active plans and preserves verified app sales across database refreshes.
- **Google AdMob Network Reporting**: Pulls impressions, eCPM, and ad network earnings via direct AdMob API integrations.

### 5. ⚡ Real-Time WebSocket Architecture
- **Interactive UI Streaming**: A dedicated WebSocket layer (`ws://localhost:3001/ws`) pushes real-time step execution progress, task statuses, and server logs straight to the frontend without requiring page refreshes.

---

## 🏗️ Technical Architecture

```
app-factory/
├── data/                    # JSON database & localized AI content repositories (gitignored)
│   ├── apps.json            # Persistent real-time application database
│   ├── credentials/         # Runtime monetization config (monetization.json)
│   └── apps_content/        # Persistent AI ASO copy, translations, & build profiles
├── server/                  # Node.js + Express Backend Engine (Port 3001)
│   ├── db/
│   │   └── store.js         # File-system project scanners, db helper & state manager
│   ├── services/
│   │   ├── build.js         # Codebase verification, keystore auditing, and AAB checker
│   │   ├── content.js       # Google Gemini AI ASO copy & product specification synthesis
│   │   ├── media.js         # Physical icon extraction & promotional asset generators
│   │   ├── monetization.js  # Google Play Console IAP catalog, GCS report sync & AdMob sync
│   │   ├── monitoring.js    # Telemetry tracking & crash analytics monitors
│   │   ├── playConsole.js   # Google Play Developer API v3 authentication & review synchronizer
│   │   ├── queue.js         # Asynchronous pipeline execution & WebSocket dispatcher
│   │   ├── submission.js    # Play Store release packaging and track staging
│   │   ├── translation.js   # Multi-locale transcreation string streaming
│   │   └── websocket.js     # WebSocket streaming server implementation
│   └── index.js             # REST API routes & server initialization
├── src/                     # React 19 + Vite Frontend UI (Port 5173 / 3000)
│   ├── components/
│   │   ├── Header.jsx       # Top command navigation bar & quick action trigger modal openers
│   │   ├── Sidebar.jsx      # Searchable application directory & status filter tabs
│   │   ├── PipelineView.jsx # Interactive 16-step automation execution visualizer
│   │   ├── StatsPanel.jsx   # Live KPI metrics overview (MRR, Ad Revenue, downloads, ratings)
│   │   ├── AdRevenueModal.jsx # Dedicated AdMob & Google Play IAP analytics modal
│   │   ├── NewAppModal.jsx  # Interactive creation modal for starting automated RN pipelines
│   │   ├── SettingsModal.jsx# Manage Google Cloud service accounts, AI models, and build roots
│   │   ├── AnalyticsModal.jsx# Global telemetry hub and published application catalog table
│   │   └── EngineBar.jsx    # Real-time WebSocket connection status & backend stream ticker
│   ├── hooks/
│   │   └── useAppEngine.js  # React hooks for API management & WebSocket stream bindings
│   └── App.jsx              # Main application container & view router
├── monetization.example.json# Example monetization config (copy to data/credentials/monetization.json)
├── .env                     # Environment settings & API secrets
├── service-account.json     # Google Cloud OAuth / Play Console IAM service account credentials
└── package.json             # NPM task scripts & dependencies
```

---

## ⚙️ Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **Android SDK & Java (JDK 17+)**: Required if triggering live Gradle builds locally
- **Google Play Developer Account**: For OAuth service account IAM access
- **Google Gemini API Key**: For AI content generation and translation pipelines

### 2. Environment Configuration
Create or modify the `.env` file in the root directory:

```env
# Backend API Port
PORT=3001

# Google Gemini Pro / Flash API Key
GEMINI_API_KEY="AIzaSy...your-actual-gemini-api-key"

# Root directory where your published React Native projects reside on disk
PROJECTS_ROOT="D:/Projects/RN/published"

# Path to your authenticated Google Cloud Service Account JSON
PLAY_CONSOLE_KEY_PATH="service-account.json"
```

### 3. Monetization Configuration
Copy `monetization.example.json` to `data/credentials/monetization.json`:

```json
{
  "adMob": {
    "publisherId": "pub-7276304756319433",
    "useServiceAccount": true
  },
  "googlePlay": {
    "reportBucket": "gs://pubsite_prod_8367979428487528590/earnings/"
  }
}
```

### 4. Service Account Setup (Google Play Console)
To enable live telemetry and Play Console billing synchronization:
1. Go to the **Google Cloud Console** and create a Service Account under your developer project.
2. Grant the service account **View app information**, **Manage production / testing releases**, and **Storage Object Viewer** (for GCS reports) in Google Cloud & Play Console.
3. Download the generated private key JSON file and place it in the root of the repository as `service-account.json`.

---

## 🚀 Running App Factory

### Start Both Backend Server & Vite Dev Server
Open two terminal windows:

**Terminal 1 — Backend API & Telemetry Engine (Port 3001):**
```bash
npm run server
```

**Terminal 2 — React Frontend Dashboard (Port 5173):**
```bash
npm run dev
```

Open your browser and navigate to **`http://localhost:5173`** to access the dashboard!

---

## 🔌 API Reference & Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/api/apps` | Retrieves all detected applications and aggregated store KPI statistics. |
| **POST** | `/api/apps` | Creates a new application entry and initializes an automated pipeline template. |
| **GET** | `/api/apps/:id` | Returns deep pipeline details, verified file paths, and current queue state. |
| **PUT** | `/api/apps/:id` | Dynamically updates an application's revenue, downloads, rating, or metadata with live WebSocket broadcast. |
| **GET** | `/api/apps/:id/icon` | Streams the physical PNG icon directly from the app's React Native asset directory. |
| **POST** | `/api/apps/:id/pipeline/run`| Triggers an asynchronous WebSocket-streamed automation job for the specified app. |
| **GET** | `/api/monetization/all` | Retrieves aggregated Google AdMob breakdown and Google Play IAP/subscription catalog numbers. |
| **GET** | `/api/apps/:id/monetization`| Retrieves per-app AdMob ad unit performance and active SKU subscriptions. |
| **GET** | `/api/settings` | Retrieves current Google Play IAM credentials, engine paths, and AI preferences. |
| **POST** | `/api/settings` | Updates and persists runtime settings without server restarts. |
| **POST** | `/api/refresh` | Re-scans `PROJECTS_ROOT` for newly created or modified local React Native folders. |
| **WS** | `ws://localhost:3001/ws`| Interactive bidirectional stream pushing real-time step execution updates. |

---

## 🛡️ License & Legal Notice
This repository and automation engine are designed for proprietary app factory deployment. Always ensure automated Play Store submissions conform to Google Play Developer Program Policies and User Data Data Safety regulations.
