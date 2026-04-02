# 🎬 VibeYtb — YouTube Shorts Automation Pipeline

> Fully automated pipeline that discovers trending AI tools, generates review videos, and publishes to YouTube Shorts + TikTok — **zero manual input**.

[![Node.js](https://img.shields.io/badge/Node.js-22-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Private-red)]()

**Channel**: [@TechHustleLabs](https://youtube.com/@TechHustleLabs)

---

## ✨ What It Does

Every day at 6:00 AM (VN), the pipeline automatically:

1. 🔍 **Discovers** a trending AI tool (Gemini AI Search)
2. ✍️ **Writes** a video script (Gemini 2.5 Flash)
3. 🎙️ **Narrates** with natural voice (Edge TTS)
4. 🎥 **Records** the actual website with interactions (Playwright)
5. 🎞️ **Produces** a polished 9:16 video with subtitles & BGM (FFmpeg)
6. 📤 **Publishes** to YouTube Shorts + TikTok with thumbnail & CTA

**Budget: $0** — All services are free tier.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│              GitHub Actions Cron (daily)             │
│              runs-on: self-hosted (Windows)          │
└──────────────────────┬──────────────────────────────┘
                       │
    ┌──────────────────▼──────────────────┐
    │        the-orchestrator.ts          │
    │   (4-phase pipeline controller)     │
    └──────────────────┬──────────────────┘
                       │
  ┌────────────────────┼────────────────────┐
  │                    │                    │
  ▼                    ▼                    ▼
Phase 1              Phase 2              Phase 3
Data Mining          Strategist           Producer
  │                    │                    │
  ▼                    ▼                    ▼
┌──────────┐    ┌──────────┐    ┌────────────────────┐
│tool-     │    │generator │    │playwright-recorder │
│discovery │    │  .ts     │    │tts-client          │
│  .ts     │    │(Gemini)  │    │media-stitcher      │
│(Gemini+  │    │          │    │visual-qc           │
│ CSE)     │    │          │    │outro-generator     │
└──────────┘    └──────────┘    └────────────────────┘
                                         │
                                         ▼
                                     Phase 4
                                     Publisher
                                         │
                              ┌──────────┴──────────┐
                              ▼                     ▼
                       ┌────────────┐        ┌────────────┐
                       │ youtube-   │        │ tiktok-    │
                       │ uploader   │        │ uploader   │
                       │ thumbnail  │        │ (optional) │
                       │ analytics  │        │            │
                       └────────────┘        └────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 22+**
- **FFmpeg** (in PATH)
- **Playwright Chromium** (`npx playwright install chromium`)
- **Windows** (self-hosted runner uses PowerShell)

### 1. Clone & Install

```bash
git clone https://github.com/hoangnguyen1200/vibeytb.git
cd vibeytb/vibeytb
npm install
npx playwright install chromium
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys (see docs/SETUP.md for details)
```

### 3. Run Pipeline

```bash
# Full pipeline (discovers tool → generates video → uploads)
npx tsx src/scripts/the-orchestrator.ts

# Skip upload (local testing)
$env:SKIP_UPLOAD='true'; npx tsx src/scripts/the-orchestrator.ts
```

### 4. Run Tests

```bash
npm test              # 18 smoke tests, <4s, zero API calls
npm run test:smoke    # Smoke test only
```

---

## 📁 Project Structure

```
vibeytb/
├── src/
│   ├── agents/
│   │   ├── agent-1-data-miner/
│   │   │   └── tool-discovery.ts      # AI tool discovery + scoring + URL verification
│   │   ├── agent-2-strategist/
│   │   │   └── generator.ts           # Gemini script generation (3-scene structure)
│   │   ├── agent-3-producer/
│   │   │   ├── playwright-recorder.ts # Website recording with stealth + interactions
│   │   │   ├── tts-client.ts          # Edge TTS narration (en-US-AndrewNeural)
│   │   │   ├── media-stitcher.ts      # FFmpeg video assembly (scale+pad+subtitle+BGM)
│   │   │   ├── visual-qc.ts           # Gemini visual quality check
│   │   │   ├── outro-generator.ts     # 3s CTA outro clip
│   │   │   ├── pexels-client.ts       # Stock video fallback (Layer 3)
│   │   │   ├── pixabay-client.ts      # Local BGM picker
│   │   │   ├── uploader.ts            # S3-compatible file upload
│   │   │   ├── veo-client.ts          # Google Veo video AI (experimental)
│   │   │   └── worker.ts              # BullMQ worker (unused, legacy)
│   │   └── agent-4-publisher/
│   │       ├── youtube-uploader.ts    # YouTube OAuth upload + pinned comment
│   │       ├── tiktok-uploader.ts     # TikTok Content Posting API
│   │       ├── thumbnail-generator.ts # Auto-generate 1280x720 thumbnail
│   │       └── analytics-tracker.ts   # 24h performance tracking → Discord
│   ├── scripts/
│   │   ├── the-orchestrator.ts        # ⭐ Main pipeline orchestrator
│   │   ├── orchestrator.smoke.test.ts # 18 smoke tests
│   │   ├── qc-video.ts               # Manual video quality check
│   │   ├── tiktok-auth.ts            # TikTok OAuth token helper
│   │   ├── get-youtube-token.ts       # YouTube OAuth token helper
│   │   └── local-scheduler.ts         # PM2 alternative scheduler
│   ├── types/
│   │   └── video-script.ts           # TypeScript interfaces
│   └── utils/
│       ├── playwright.ts             # Stealth browser config (12 anti-bot vectors)
│       ├── notifier.ts               # Discord webhook notifications
│       └── ffmpeg.ts                 # FFmpeg path resolver
├── assets/bgm/                       # Local BGM music files
├── PROJECT_CONTEXT.md                 # Living project documentation
├── package.json
├── vitest.config.ts
└── .env.example
```

---

## 🔧 Configuration

### Required Environment Variables

| Variable | Service | How to Get |
|---|---|---|
| `GEMINI_API_KEY` | Gemini 2.5 Flash | [Google AI Studio](https://aistudio.google.com/) |
| `GOOGLE_CLIENT_ID` | YouTube OAuth | [Google Cloud Console](https://console.cloud.google.com/) |
| `GOOGLE_CLIENT_SECRET` | YouTube OAuth | Google Cloud Console |
| `GOOGLE_REFRESH_TOKEN` | YouTube OAuth | Run `npx tsx src/scripts/get-youtube-token.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | Database | [Supabase Dashboard](https://supabase.com/) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Database | Supabase Dashboard |
| `PEXELS_API_KEY` | Stock video fallback | [Pexels API](https://www.pexels.com/api/) |
| `DISCORD_WEBHOOK_URL` | Notifications | Discord Server Settings → Integrations |

### Optional Environment Variables

| Variable | Service | Notes |
|---|---|---|
| `TIKTOK_CLIENT_KEY` | TikTok cross-post | Requires Content Posting API audit approval |
| `TIKTOK_CLIENT_SECRET` | TikTok cross-post | TikTok Developer Portal |
| `TIKTOK_REFRESH_TOKEN` | TikTok cross-post | Run `npx tsx src/scripts/tiktok-auth.ts` |
| `GOOGLE_CSE_API_KEY` | Google Custom Search | Requires Cloud Billing (inactive) |
| `GOOGLE_CSE_ID` | Google Custom Search | Google Programmable Search |
| `SKIP_UPLOAD` | Skip upload step | Set to `'true'` for local testing |

---

## 📊 External Services

| Service | Purpose | Cost | Status |
|---|---|---|---|
| Gemini 2.5 Flash | Script generation + Visual QC + Tool discovery | Free (20 RPD) | ✅ Active |
| Edge TTS | Text-to-speech narration | Free | ✅ Active |
| Playwright | Website recording with interactions | Free | ✅ Active |
| FFmpeg | Video processing (scale, pad, subtitle, concat) | Free | ✅ Active |
| Supabase | Database (video_projects tracking) | Free tier | ✅ Active |
| YouTube Data API | Video upload + analytics | Free (10k quota/day) | ✅ Active |
| Pexels | Stock video fallback | Free (200 req/hr) | ✅ Active |
| Discord Webhooks | Pipeline monitoring | Free | ✅ Active |
| TikTok Content API | Cross-post to TikTok | Free | ⏳ Pending audit |
| Google Custom Search | Secondary tool discovery | Requires billing | ❌ Inactive |

---

## 🧪 Testing

```bash
npm test                # Run all 18 tests
npm run test:smoke      # Smoke test only
npm run test:watch      # Watch mode
```

| Test Group | Count | What it validates |
|---|---|---|
| Import Chain | 2 | Broken imports, missing modules |
| Status Transitions | 3 | VideoStatus enum values |
| Path Helpers | 2 | Temp/video file paths |
| Error Handler | 2 | failJob before cleanupTmp |
| Self-Healing | 1 | Phase 3 re-run when video absent |
| envFlag Parser | 1 | Truthy environment values |
| Baseline | 2 | Basic sanity checks |

---

## 🔄 CI/CD

### Daily Pipeline
- **Trigger**: Cron `0 23 * * *` UTC (6:00 AM VN) + manual dispatch
- **Runner**: Self-hosted (Windows, residential IP)
- **Timeout**: 30 minutes
- **Workflow**: `.github/workflows/daily-pipeline.yml`

### Smoke Test
- **Trigger**: Push/PR to `main`
- **Runner**: GitHub-hosted `ubuntu-latest`
- **Workflow**: `.github/workflows/smoke-test.yml`

### Pre-commit Hook
- **Tool**: Husky
- **Action**: Runs `vitest run` before every commit
- **Rule**: Never bypass with `--no-verify`

---

## 📄 Documentation

| Document | Description |
|---|---|
| [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) | Living project status, architecture, changelog |
| [docs/SETUP.md](./docs/SETUP.md) | Detailed setup guide with screenshots |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Deep-dive into each agent and data flow |

---

## 📜 License

Private repository. All rights reserved.
