# 🛠️ Setup Guide — VibeYtb Pipeline

> Step-by-step guide to get the pipeline running from scratch.

---

## Prerequisites

| Tool | Version | Download |
|---|---|---|
| Node.js | 22+ | [nodejs.org](https://nodejs.org/) |
| FFmpeg | 7+ | [ffmpeg.org](https://ffmpeg.org/download.html) |
| Git | Any | [git-scm.com](https://git-scm.com/) |

### Verify Prerequisites

```bash
node --version    # Should output v22.x.x or higher
ffmpeg -version   # Should output ffmpeg version 7.x or higher
git --version     # Any version
```

---

## Step 1: Clone & Install

```bash
git clone https://github.com/hoangnguyen1200/vibeytb.git
cd vibeytb/vibeytb
npm install
```

### Install Playwright Browser

```bash
npx playwright install chromium
```

> ⚠️ Only Chromium is needed. Firefox/WebKit are not used.

---

## Step 2: Setup External Services

### 2.1 Supabase (Database)

1. Go to [supabase.com](https://supabase.com/) → Create project
2. Run the migration SQL:
   ```sql
   -- File: supabase/migrations/20260311_init_schema.sql
   -- Copy and run in Supabase SQL Editor
   ```
3. Copy from **Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2.2 Gemini API (AI Engine)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click **Get API Key** → Create key
3. Copy `GEMINI_API_KEY`

> Free tier: 20 requests/day — pipeline uses ~5-8 per run.

### 2.3 YouTube OAuth (Upload)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable **YouTube Data API v3**
3. Create **OAuth 2.0 Credentials** (Desktop App type)
4. Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
5. Generate refresh token:
   ```bash
   npx tsx src/scripts/get-youtube-token.ts
   ```
   - Opens browser → Sign in with your YouTube account
   - Copy the `GOOGLE_REFRESH_TOKEN` from terminal output

> ⚠️ OAuth scopes needed: `youtube.upload` + `youtube.force-ssl` (for pinned comments)

### 2.4 Pexels (Stock Video Fallback)

1. Go to [pexels.com/api](https://www.pexels.com/api/) → Sign up
2. Copy `PEXELS_API_KEY`

> Free: 200 requests/hour. Used only when Playwright recording fails.

### 2.5 Discord Webhook (Notifications)

1. Discord Server → **Settings → Integrations → Webhooks**
2. Create webhook → Copy URL as `DISCORD_WEBHOOK_URL`

### 2.6 TikTok (Optional — Cross-post)

1. Go to [TikTok Developer Portal](https://developers.tiktok.com/)
2. Create app → Enable **Content Posting API**
3. Submit audit (2-4 weeks review)
4. After approval, generate tokens:
   ```bash
   npx tsx src/scripts/tiktok-auth.ts
   ```
5. Copy `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN`

---

## Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with all values from Step 2:

```env
# Required
GEMINI_API_KEY=your-gemini-key
GOOGLE_CLIENT_ID=your-yt-client-id
GOOGLE_CLIENT_SECRET=your-yt-client-secret
GOOGLE_REFRESH_TOKEN=your-yt-refresh-token
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
PEXELS_API_KEY=your-pexels-key
DISCORD_WEBHOOK_URL=your-discord-webhook

# Optional
TIKTOK_CLIENT_KEY=your-tiktok-key
TIKTOK_CLIENT_SECRET=your-tiktok-secret
TIKTOK_REFRESH_TOKEN=your-tiktok-token
```

---

## Step 4: Test Run

### Smoke Test (no API calls)

```bash
npm test
```

Expected: 18 tests pass in <4 seconds.

### Dry Run (with API calls, no upload)

```powershell
$env:SKIP_UPLOAD='true'
npx tsx src/scripts/the-orchestrator.ts
```

This will:
- ✅ Discover an AI tool (Gemini)
- ✅ Generate script
- ✅ Create TTS audio
- ✅ Record website
- ✅ Produce video
- ❌ Skip upload

Check `tmp/` folder for output files.

### Full Run

```bash
npx tsx src/scripts/the-orchestrator.ts
```

---

## Step 5: Setup Self-hosted Runner

### Why Self-hosted?

GitHub Actions datacenter IPs get blocked by many websites during Playwright recording. Self-hosted runner uses your residential IP.

### Setup

1. Go to GitHub repo → **Settings → Actions → Runners → Add runner**
2. Follow GitHub instructions to install runner on your Windows machine
3. Start runner:
   ```powershell
   cd actions-runner
   .\run.cmd
   ```

### PM2 (Keep Runner Alive)

```bash
npm install -g pm2
pm2 start run.cmd --name github-runner
pm2 save
pm2 startup
```

---

## Step 6: GitHub Secrets

Add these secrets to **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `GEMINI_API_KEY` | Your Gemini API key |
| `GOOGLE_CLIENT_ID` | YouTube OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | YouTube OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | YouTube OAuth refresh token |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `PEXELS_API_KEY` | Pexels API key |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL |
| `TIKTOK_CLIENT_KEY` | TikTok client key (optional) |
| `TIKTOK_CLIENT_SECRET` | TikTok client secret (optional) |
| `TIKTOK_REFRESH_TOKEN` | TikTok refresh token (optional) |

---

## Troubleshooting

### Playwright recording shows blank page

- **Cause**: Website blocked bot or loaded too slowly
- **Fix**: Pre-warm phase (4s load time) already implemented. Check if site requires login.

### FFmpeg "Error reinitializing filters!"

- **Cause**: Portrait-to-landscape conversion conflict
- **Fix**: Already fixed — uses raw FFmpeg filtergraph instead of fluent-ffmpeg chains.

### YouTube upload 403

- **Cause**: OAuth token expired or wrong scopes
- **Fix**: Re-run `npx tsx src/scripts/get-youtube-token.ts` with both scopes.

### TikTok "unaudited_client"

- **Cause**: Content Posting API not yet audited
- **Fix**: Submit audit at TikTok Developer Portal. Pipeline skips gracefully.

### Tests fail on commit

- **Cause**: Pre-commit hook runs vitest
- **Fix**: Fix failing tests. Never use `--no-verify`.
