# VibeYtb — Project Context & Status

> **Đọc file này ĐẦU TIÊN** khi bắt đầu session mới.
> Cập nhật lần cuối: 2026-04-06 (Pipeline Quality v3.0 — 4 fixes + CSE removal + Husky fix)

---

## 🎯 Dự Án Là Gì?

**YouTube Automation Pipeline** — tự động tạo video Shorts review AI tools cho kênh **@TechHustleLabs**.

Pipeline 4 phase:
1. **Data Mining**: Tìm tool AI mới (Gemini AI Search only — CSE disabled)
2. **Strategist**: Gemini viết script video
3. **Producer**: TTS + Playwright recording + FFmpeg stitching
4. **Publisher**: Upload lên YouTube + TikTok (sequential, graceful fallback)

## 💰 Ngân Sách

**$0** — Dự án không có vốn. Tất cả services phải miễn phí.

## 🕐 Lịch Dùng Máy (Self-hosted Runner)

- **Thứ 2–6**: 7:30 AM – 4:30 PM (VN, GMT+7)
- **Thứ 7–CN**: Linh hoạt, không cố định

### Cron khuyến nghị:

```
VN 6:00 AM = UTC 23:00 = EST 6:00 PM
+ GitHub delay ~2h → chạy thực tế ~8-9 AM VN = 8-9 PM EST (US prime time)
Cron: 0 23 * * *
```

> **Lưu ý**: Pipeline thực tế chạy ~8:00-9:00 AM VN (sau delay).
> Cuối tuần cần đảm bảo máy bật trước 8:00 AM nếu muốn có video.

## 🏗️ Kiến Trúc Hiện Tại

```
GitHub Actions Cron (daily-pipeline.yml)
  ├── runs-on: self-hosted (máy cá nhân, Windows, PowerShell)
  ├── Node.js 22 + FORCE_JAVASCRIPT_ACTIONS_TO_NODE24
  ├── Phase 1: Gemini AI Search only (CSE disabled 2026-04-06) → pickBestTool()
  ├── Phase 2: Gemini script generation (với real tool data)
  ├── Phase 3: Edge TTS (retry) + Playwright 1080×1200 + FFmpeg scale+pad → 1080×1920
  └── Phase 4: YouTube upload via OAuth + TikTok cross-post (best-effort)
```

### Phase 1: Data Mining (1 active source)

```
  Source 1 (Primary):   Gemini AI Search → 5-10 AI tools + URLs
  Source 2 (DISABLED):  Google CSE — disabled 2026-04-06 (user decision, returns [])
  → Filter recently used
  → Score (URL reliability + popularity + tagline + name + keywords)
  → Sort by score → verifyUrl() → 1 winner
  Fallback: discoverFreshTopic() → guessWebsiteUrl()
```

> `urlSource` field tracks which source: `'gemini-search'` | `'google-cse'` | `'guess'`
> PH RSS + HN scrapers **removed** (2026-03-30): PH blocked by CF, HN = GitHub repos + non-AI
> Google CSE **disabled** (2026-04-06): User decided not to use. Function preserved for API compat, returns empty array

### Tool Selection Scoring

```
scoreTool():
  URL reliability:  +40 if pre-resolved (gemini-search/google-cse)
  Popularity:       0-30 (Gemini rating / CSE baseline)
  Tagline quality:  0-15 (length ≥ 40 = 15pts)
  Name quality:     0-10 (length ≤ 12 = 10pts)
  Video keywords:   +5 ("AI", "free", "automation", etc.)
  Max: 100pts
```

### URL Verification (3-layer)

```
verifyUrl(url, toolName):
  Layer 0: Non-product check → reject GitHub, Twitter, Medium, Reddit…
  Layer 1: HTTP check → site alive? (200-399 or 403/503 = CF but exists)
  Layer 2: Content relevance → page <title>/<meta> chứa tên tool?
  → ✅ alive + relevant → OK
  → ❌ dead / wrong site / non-product → skip, try next tool
```

### Visual Cascade (Phase 3)

```
Layer 1: Record actual website (Playwright) → Visual QC
  ↓ if fail
Layer 2: REMOVED (2026-03-30) — PH page always blocked by Cloudflare Turnstile
  ↓
Layer 3: Pexels stock video (fallback)
```

> `tool_name` được inject vào ALL scenes ở Phase 1-2 (không phụ thuộc LLM).

### Video Pipeline (Phase 3 — FFmpeg)

```
Playwright recording 1080×1200 (compact desktop viewport)
  ↓ FFmpeg scale
scale to 1080px wide (ensure exact width)
  ↓ FFmpeg pad
pad 1080×1920 (black bars top/bottom → 9:16 portrait)
  ↓ subtitles + aresample 48kHz stereo
Per-scene merge (libx264 8M CBR)
  ↓ concat FILTER (re-encode, NOT demuxer)
All scenes merged with consistent audio
  ↓ amix BGM (15%) + loudnorm (-16 LUFS)
Final video 1080×1920 9:16
```

> Website hiển thị **compact desktop layout** (1080px width > 1024px breakpoint). Full width visible, no horizontal cropping.

### Các File Quan Trọng

> ⚠️ **LƯU Ý**: `.github/workflows/` nằm ở **REPO ROOT** (`VibeYtb/.github/`), KHÔNG phải trong `vibeytb/`. Khi search file workflow, phải search từ root repo.

| File | Vai trò |
|---|---|
| `/.github/workflows/daily-pipeline.yml` | **Full pipeline** — chạy daily (cron) hoặc manual (workflow_dispatch), self-hosted runner |
| `src/scripts/the-orchestrator.ts` | Main pipeline orchestrator |
| `src/agents/agent-1-data-miner/tool-discovery.ts` | AI tool discovery (Gemini Search + Google CSE) + scoring + URL verify |
| `src/agents/agent-2-strategist/generator.ts` | Gemini script generator |
| `src/agents/agent-3-producer/playwright-recorder.ts` | Website recording + Smart CTA Click |
| `src/agents/agent-3-producer/visual-qc.ts` | Gemini Visual QC (kiểm tra video quality) |
| `src/agents/agent-3-producer/tts-client.ts` | Edge TTS voice |
| `src/agents/agent-3-producer/pixabay-client.ts` | Local BGM picker (chọn random từ `assets/bgm/`) |
| `src/agents/agent-3-producer/media-stitcher.ts` | FFmpeg video assembly (scale+pad 1080×1920, subtitles `original_size=1080x1920`, concat filter 8M CBR, BGM mix `-c:v copy`) |
| `src/agents/agent-3-producer/outro-generator.ts` | 3s outro CTA clip (FFmpeg drawtext) |
| `src/agents/agent-4-publisher/youtube-uploader.ts` | YouTube upload + pinned comment CTA + thumbnail |
| `src/agents/agent-4-publisher/thumbnail-generator.ts` | Auto-generate 1280×720 thumbnail from video frame (uses `ffmpegPath` from `@ffmpeg-installer`) |
| `src/agents/agent-4-publisher/tiktok-uploader.ts` | TikTok cross-post via Content Posting API (OAuth2 + FILE_UPLOAD) |
| `src/agents/agent-4-publisher/analytics-tracker.ts` | YouTube 24h analytics (views/likes/comments → Supabase + Discord) |
| `src/scripts/orchestrator.smoke.test.ts` | Smoke test (18 tests, <3s, zero API calls) |
| `.husky/pre-commit` | Pre-commit hook → chạy vitest trước mỗi commit |
| `.github/workflows/smoke-test.yml` | CI smoke test trên push/PR to main |
| `src/app/dashboard/page.tsx` | **Dashboard** — Pipeline monitor, stats cards, health bar, video table |
| `src/app/videos/page.tsx` | Videos list — paginated, filterable by status |
| `src/app/videos/[id]/page.tsx` | Video detail — YouTube embed, script viewer, platform links |
| `src/app/analytics/page.tsx` | Analytics — Recharts views/likes charts, top performers |
| `src/app/publish/page.tsx` | Multi-platform publish — TikTok 5-point UX, future platforms |
| `src/app/api/videos/route.ts` | API: list videos (paginated, filterable) |
| `src/app/api/videos/[id]/route.ts` | API: single video detail |
| `src/app/api/analytics/summary/route.ts` | API: aggregated pipeline stats |
| `src/app/components/Sidebar.tsx` | Dashboard sidebar navigation + sign-out button |
| `src/app/components/ConditionalLayout.tsx` | Hides sidebar on auth pages (login, callback) |
| `src/app/components/StatsCard.tsx` | Reusable stat card component |
| `src/app/components/VideoStatusBadge.tsx` | Video status badge with color coding |
| `src/app/login/page.tsx` | Login page (Supabase Auth, dark theme, Suspense boundary) |
| `src/app/auth/callback/route.ts` | OAuth callback route (code exchange) |
| `src/app/auth/signout/route.ts` | Sign-out API route |
| `src/app/api/publish/queue/route.ts` | Publish queue API (POST/GET) |
| `src/lib/supabase/browser.ts` | Supabase browser client (cookie-based) |
| `src/lib/supabase/server.ts` | Supabase server client (SSR cookies) |
| `src/middleware.ts` | Auth middleware — protects all routes, redirects to /login |

### External Services

| Service | Dùng cho | Credentials |
|---|---|---|
| Supabase | Database (video_projects table) | `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` |
| Google Cloud Console | YouTube OAuth | `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` |
| Gemini API (2.5 Flash) | Script gen + Visual QC + URL lookup | `GEMINI_API_KEY` |
| Pexels | Stock footage fallback (Layer 3) | `PEXELS_API_KEY` |
| Discord | Pipeline monitoring webhook | `DISCORD_WEBHOOK_URL` |
| TikTok Content API | TikTok cross-post (optional) | `TIKTOK_CLIENT_KEY`, `CLIENT_SECRET`, `REFRESH_TOKEN` |
| Google Custom Search | Tech site search (Source 2) | `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ID` |

> ~~Pixabay~~ — ĐÃ XÓA (2026-03-25). Giờ dùng local BGM từ `assets/bgm/`.

### Gemini API Quota (Free Tier)

| Metric | Limit |
|---|---|
| RPD (Requests/Day) | 20 |
| RPM (Requests/Min) | 5 |
| TPM (Tokens/Min) | 250K |

- Pipeline tiêu ~8-10 requests/run → nằm trong 20 RPD
- Quota reset ~2:00 PM VN hàng ngày (12 AM Pacific)
- Fallback model: `gemini-2.0-flash` (khi 2.5 Flash bị 429)

## ✅ Đã Hoàn Thành

1. **Channel branding**: Linktree, description template, playlist
2. **URL Propagation**: Tool URL shared to ALL scenes
3. **DemoHunter improvements**: Quick-skip hero, gallery/examples nav, deeper scroll
4. **Smart CTA Click**: Click "Try Free" → detect login → go back if auth
5. **SSH setup**: ed25519 key, GitHub remote via SSH
6. **Product Hunt integration**: RSS scraper primary → LLM fallback
7. **YouTube channel verification**: Đang chờ xác minh (cần cho external links)
8. **URL Resolution via Gemini**: Thay URL guessing bằng Gemini lookup (2026-03-25)
9. **Pixabay API removed**: Local BGM only, không còn Pixabay dependency (2026-03-25)
10. **Tool name injection**: `tool_name` inject vào all scenes cho Layer 2 cascade (2026-03-25)
11. **SKIP_UPLOAD flag**: `SKIP_UPLOAD=true` env để test local không upload (2026-03-25)
12. **Node.js upgrade**: 20 → 22, `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`, xóa npm cache (2026-03-25)
13. **Phase 4 crash fix**: Self-healing auto-rerun Phase 3 khi video missing + failJob() before cleanup (2026-03-25)
14. **Smoke tests**: 13 tests, <3s, zero API calls — import chain, status transitions, error handler, self-healing (2026-03-25)
15. **Pre-commit hook**: Husky chạy `vitest run` trước mỗi commit — block commit nếu test fail (2026-03-25)
16. **CI smoke test**: `.github/workflows/smoke-test.yml` — chạy trên push/PR to main (2026-03-25)
17. **Video quality fix**: Viewport 1920×1080 (desktop) + FFmpeg center-crop → 1080×1920 portrait (2026-03-26)
18. **Input Hunter validation fix**: Smart input-type detection (url/email/search/text) + validation error scanner + self-correction fallback to Demo Hunter (2026-03-26)
19. **Caption timing ≥1.5s**: Min caption duration raised from 0.8s to 1.5s for readable subtitles (2026-03-26)
20. **BGM volume 5%→15%**: Background music now audible without overpowering voice (2026-03-26)
21. **Pinned comment CTA**: Auto-posts engagement comment with tool link after upload (2026-03-26)
22. **Subtitle styling v2**: Opaque black box (BorderStyle=3) + 36px bold — readable on mobile over bright backgrounds (2026-03-26)
23. **Outro CTA clip**: Auto-generated 3s outro appended to every video — "Follow @TechHustleLabs" branding (2026-03-26)
24. **Auto thumbnail**: 1280×720 thumbnail extracted from video frame with tool name overlay, uploaded via YouTube API (2026-03-26)
25. **TikTok cross-post**: Content Posting API via OAuth2 FILE_UPLOAD flow, best-effort after YouTube upload — graceful skip when creds missing (2026-03-26)
26. **Anti-bot stealth hardening**: Pure Playwright stealth in `playwright.ts` — WebDriver evasion, Chrome args, navigator fingerprint overrides (plugins/languages/platform/hwConcurrency/deviceMemory), WebGL spoofing, chrome.runtime mock, permission query override (2026-03-27)
27. **Sequential upload + UPLOAD_PENDING**: Phase 4 rewritten — pre-flight credential check, YouTube→TikTok sequential upload with independent try/catch, `UPLOAD_PENDING` status for videos produced but not uploaded, Discord warning notification for upload-skipped/failed (2026-03-27)
28. **Dead code cleanup**: Deleted `youtube-login.ts`, `save-auth.ts` (replaced by OAuth). Archived 5 legacy test scripts to `src/scripts/legacy-tests/`. Fixed smoke test for `UPLOAD_PENDING` enum (2026-03-27)
29. **FFmpeg crop fix**: Added `scale` filter before `crop` in `media-stitcher.ts` — handles any input resolution (was crashing on Pexels 360×640 videos). Changed Pexels API `size: 'medium'` → `'large'` (2026-03-27)
30. **URL Resolution v2**: 3-tier fallback chain — Plan A: scrape "Visit website" href from PH page via Playwright stealth, Plan B: Gemini LLM lookup, Plan C: guessWebsiteUrl(). Added `urlSource` field to track resolution method (2026-03-29)
31. **Anti-bot stealth v2**: 3 new vectors — canvas fingerprint noise, AudioContext spoof, chrome.csi mock. Added Sec-Ch-Ua HTTP headers. Total: 12 stealth vectors (2026-03-29)
32. **Gemini Search grounding**: Enabled `googleSearch` tool for Plan B URL resolution — Gemini now searches Google before answering instead of guessing from training data. Fixes wrong TLD issues (e.g. `.ai` instead of `.sh`) (2026-03-29)
33. **Cloudflare Auto-Wait**: `waitForCloudflarePass()` polls for CF challenge elements and waits up to 15s for auto-pass on residential IP. Updated Chrome fingerprint 120→134. Visual QC frame timestamps shifted to 50%/75%/90% to skip loading frames (2026-03-29)
34. **URL Resolution via PH redirect**: New Plan A — follow `/r/p/<id>` redirect URLs from RSS feed via HTTP fetch (no browser, no Cloudflare). Completely bypasses PH's Cloudflare Turnstile. Old Plan A (page scrape) demoted to A-bis (2026-03-29)
35. **Blacklist false-positive fix**: `BLOCKED_DOMAINS` check changed from `url.includes(domain)` to proper hostname matching (`hostname === domain || hostname.endsWith(.domain)`). Fixes `guideyou.com` being falsely blocked by `you.com` rule (2026-03-30)
36. **Multi-source discovery**: Phase 1 now merges 3 sources — PH RSS + HN "Show HN" API + Gemini AI Search. Pool tăng từ ~25 → ~35 tools (2026-03-30)
37. **Layer 2 removed**: PH page recording (Cloudflare Turnstile block 100%) removed. Layer 1 fail → thẳng Layer 3 stock (2026-03-30)
38. **URL Verification**: 2-layer verify — HTTP alive check + content relevance (title/meta match tool name). Wrong URLs auto-skip to next tool (2026-03-30)
39. **Scoring-based tool selection**: `scoreTool()` — 5 criteria: URL reliability (+40), popularity (0-30 from HN upvotes/PH position/Gemini rating), tagline quality (0-15), name quality (0-10), video keywords (+5). Sort by score, try highest first (2026-03-30)
40. **Non-product URL filter**: `verifyUrl()` Layer 0 rejects GitHub, Twitter, Medium, Reddit, YouTube, app stores, npm/PyPI. Prevents recording code repos or social media instead of product websites (2026-03-30)
41. **PH RSS + HN removed**: Removed Product Hunt RSS and Hacker News scraper from Phase 1. PH: Cloudflare blocks all redirect URLs. HN: mostly GitHub repos + non-AI tools. Both replaced by Gemini AI Search + Google Custom Search API (2026-03-30)
42. **Google Custom Search API**: New Source 2 — searches producthunt.com, techcrunch.com, theverge.com, venturebeat.com for new AI tools. Free 100 queries/day. Env vars: `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ID` (2026-03-30)
43. **Trending-focused prompts**: Gemini Search prompt rewrote to emphasize "MOST TRENDING", "going viral", "RIGHT NOW". Google CSE query uses dynamic year. Both use dynamic date params for freshness (2026-03-30)
44. **CSE URL resolution**: Google CSE returns article URLs (techcrunch.com/...), not product URLs. Fixed: extract tool NAME from article title → resolve real product URL via Gemini + Google Search grounding → fallback guessWebsiteUrl(). Prevents recording news articles instead of product demos (2026-03-30)
45. **Major cleanup**: Deleted 18 dead files (PH/HN scrapers, legacy tests, debug scripts, queue-based tests). Renamed `scraper-producthunt.ts` → `tool-discovery.ts`, `ProductHuntTool` → `DiscoveredTool`. Removed ~200 lines dead PH code (RSS parser, redirect resolver, TECH_KEYWORDS). File count: 480 lines (was 623) (2026-03-30)
46. **DB audit + migration 04**: Added missing columns `tiktok_url`, `tool_name`, `tool_url`, `discovery_source`. Added indexes on `created_at`, `tool_name`, `status`. Orchestrator now writes tool metadata to top-level columns for fast Content Memory queries (2026-03-30)
47. **Thumbnail + SEO + Engagement**: Thumbnail — gradient overlay + dynamic badge (FREE/NEW/TRENDING based on tagline) + emoji + subtitle. SEO — auto-inject `#toolname` hashtag + auto-add tool to tags + `#trending`. Engagement — 4 rotating pinned comment templates with question hooks + improved outro with engagement CTA. Fixed PH references in generator prompt (2026-03-30)
48. **Subtitle overlay fix**: Text was covering ~40% of video screen. Root cause: `Fontsize=36` + `BorderStyle=3` (opaque box) on 1080×1920 canvas. Fix: `Fontsize=22` + `BorderStyle=1` (outline only) + `MarginV=180` (pushed to bottom). Text now compact and readable without blocking video content (2026-03-30)
49. **Black screen fix — start**: Playwright records from browser launch (blank page during load). Fix: `-ss 2` skips first 2s of each recording. Scene 1 (2.95s TTS) was ENTIRELY blank before this fix (2026-03-31)
50. **Black screen fix — end**: TTS trailing silence creating extra dead frames. Fix: `silenceremove` filter (stop_periods=1, stop_threshold=-50dB) trims dead air from each scene's audio before stitching (2026-03-31)
51. **Thumbnail FFmpeg crash fix**: `force_original_aspect_ratio=increase` on portrait 1080×1920 → landscape 1280×720 caused `Error reinitializing filters`. Fix: direct `scale 1280:720` without aspect ratio constraint. Also removed broken Unicode emoji escape in drawtext (2026-03-31)
52. **Pinned comment OAuth scope fix**: `Request had insufficient authentication scopes` — `get-youtube-token.ts` only requested `youtube.upload`. Fix: added `youtube.force-ssl` scope. Requires user to re-run token script and update .env + GitHub Secrets (2026-03-31)
53. **Error logging improvements**: Pinned comment error now logs HTTP status code + actionable fix hint for scope issues (2026-03-31)
54. **Subtitle redesign v3**: From boring (Impact 22px, outline only, sát đáy) → modern viral style (Arial 14px bold, semi-transparent dark background box, MarginV=320 in bottom black zone, MarginL/R=80). Inspired by CapCut/Submagic trends. Subtitle now compact, không che website content, tránh YouTube UI (2026-03-31)
55. **Video bitrate fix**: `mergeToFile()` re-encoded without bitrate settings (8M → 1.2M). Fixed: replaced with FFmpeg concat demuxer + `-c copy` (zero re-encoding, preserves original 8 Mbps, concat ~10x faster). QC soft threshold raised 2M → 4M (2026-03-31)
56. **Viewport overhaul**: 1920×1080 → 1080×1200. Eliminates horizontal cropping (was cutting 420px each side → logo/nav invisible). Website now renders at 1080px width (still desktop layout), full view visible. Simplified FFmpeg: removed crop filter, just scale+pad (2026-03-31)
57. **Interaction UX v2**: Cursor 30px→48px, added click ripple animation (white circle expand), hover 600ms→1200ms, click pause 300ms→500ms. Removed hero skip → 2.5s brand pause. Smoother cursor transition (ease-out) (2026-03-31)
58. **Gemini model fix**: `gemini-1.5-flash-latest` removed from Google API (404). Replaced fallback model with `gemini-2.0-flash` in generator.ts + visual-qc.ts (2026-04-01)
59. **Subtitle reposition**: Font 14→16px (mobile readability), MarginV 320→120 (moved from top to bottom black zone, avoids YouTube UI overlay) (2026-04-01)
60. **TTS retry logic**: Edge TTS often times out → added 3-attempt retry with exponential backoff (3s, 6s) in tts-client.ts. Prevents pipeline crash on transient network issues (2026-04-01)
61. **Concat audio fix**: concat demuxer (`-c copy`) silently dropped audio from Scene 2+ (different AAC headers between website recording vs stock video). Replaced with concat FILTER (re-encode at 8M). Audio now continuous across all scenes. Slightly slower concat but 100% reliable (2026-04-01)
62. **CRITICAL: silenceremove removed**: Filter was DESTROYING 75-87% of narration! TTS natural pauses (0.3s+ between sentences) triggered `stop_threshold=-50dB` → filter cut audio to 1.4-3.2s out of 10-13s scenes. Narration now plays full duration. Minor trailing dead air from Edge TTS is acceptable trade-off (2026-04-01)
63. **amix normalize=0**: `amix` default divides all input volumes by number of inputs (2). Added `normalize=0` to preserve original narration volume when mixing with BGM (2026-04-01)
64. **Smart CTA scene-gated**: CTA button click ("Try Free", "Get Started") now only fires on Scene 1. Scenes 2-4 skip CTA → just scroll/hover. Prevents repeated login-page fallback to stock video. Go-back stabilization delay increased 1s→3s (2026-04-01)
65. **Outro audio fix**: Replaced `anullsrc` (dead silence -91dB) with inaudible 1Hz sine wave (-60dB). Keeps audio stream "active" so BGM naturally overlaps during Phase 2 amix. Outro no longer ends in abrupt dead silence (2026-04-01)
66. **Discord notifications enhanced**: Tool name, website URL, data source, clickable YouTube/TikTok links, thumbnail embed, pipeline duration. Failures include tool context too (2026-04-01)
67. **Visual QC retry**: 1 retry for transient errors (timeout, ECONNRESET, 5xx) with 3s delay before falling back to stock video. Genuine QC failures (blank, Cloudflare) are NOT retried (2026-04-01)
68. **A/B Title Templates**: 4 title styles (question, bold_claim, listicle, urgency) randomly selected per run. Injected as directive in Gemini prompt. Enables organic title variation (2026-04-01)
69. **BGM Mood Matching**: `pixabay-client.ts` now matches mood keywords to file names via MOOD_MAP (upbeat/calm/energetic). Gemini's `music_mood` output is normalized to 3 categories via MOOD_NORMALIZE map. Falls back to random if no match (2026-04-01)
70. **Viral Hook Overlay**: Scene 1 gets drawtext overlay with first sentence of narration (≤40 chars). Fade in 0-0.5s, visible 0.5-2s, fade out 2-2.5s. Position: y=200 (top safe zone). Other scenes unaffected (2026-04-01)
71. **Premium Thumbnail**: Vignette overlay at top, purple accent bar, taller gradient (180px), text shadow/border on tool name, brand-consistent purple subtitle. Badge auto-detects FREE/NEW/TRENDING from tagline (2026-04-01)
72. **YouTube Analytics Tracker**: New `analytics-tracker.ts` fetches 24h stats (views, likes, comments) via YouTube Data API. Stores to Supabase (`views_24h`, `likes_24h`, `comments_24h`). Sends Discord summary. Runs via separate `analytics-pipeline.yml` cron (UTC 0:00 = VN 7:00 AM) (2026-04-01)
73. **TikTok dual-post ready**: Code fully integrated in orchestrator. Auto-activates when `TIKTOK_REFRESH_TOKEN` is set and TikTok approves the app. No code change needed (2026-04-01)
74. **Scene 1 min duration**: Enforce minimum 5s recording duration for Scene 1 (short TTS hooks < 5s caused blank page → stock fallback). `recordDuration` override in orchestrator (2026-04-02)
75. **Pre-warm website load**: Playwright now loads page + waits 4s for render BEFORE starting interaction budget timer. Eliminates blank page in recording (2026-04-02)
76. **Thumbnail rewrite**: Replaced `fluent-ffmpeg` complexFilter with raw `execSync` + `-vf` simple filtergraph. Fixes "Error reinitializing filters!" crash on portrait→landscape conversion. Seek at 4s instead of 2s (2026-04-02)
77. **TikTok permanent error skip**: Detects unaudited_client/scope_not_authorized/invalid_client errors → skip immediately (no wasteful retries). Shows actionable message with Dev Portal link (2026-04-02)
78. **Bitrate floor**: Added `-minrate 6M` to concat Phase 2 → stock footage scenes no longer drag average bitrate below 5 Mbps (2026-04-02)
79. **Subtitle positioning**: MarginV=120→180 (y=1740, deeper in bottom black zone), Fontsize=16→15. Ensures subtitles don't overlap website content area (ends at y=1560) (2026-04-02)
80. **Dashboard MVP**: Full web dashboard (Next.js App Router) — 5 pages: Pipeline Monitor (stats + health + video table), Videos List (paginated + filterable), Video Detail (YouTube embed + script viewer + platform links), Analytics (Recharts charts + top performers), Multi-Platform Publish (TikTok 5-point UX compliance + future platforms). Dark theme design system, zero pipeline code changes, Supabase API routes. Migration `05_dashboard_tables.sql` adds `dashboard_settings` + `publish_queue` tables (2026-04-02)
81. **Supabase Auth**: Login page (email/password), auth middleware protects all routes → redirect to `/login`, sign-out button in sidebar, cookie-based SSR sessions via `@supabase/ssr`. ConditionalLayout hides sidebar on auth pages. Suspense boundary for `useSearchParams()` SSG compat (2026-04-02)
82. **Vercel Deploy**: Dashboard deployed to Vercel free tier at `vibeytb.vercel.app`. Env vars (SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY) configured in Vercel. Build fixes: ffprobe callback types, `@types/pg`, Suspense boundary (2026-04-02)
83. **TikTok 5-point UX Post Form**: Full compliance form in `/publish` — (1) Privacy selector no default, (2) Comment/Duet/Stitch toggles, (3) Content disclosure checkboxes, (4) Video preview panel, (5) User-initiated post action. Publish queue API supports future multi-platform posting (2026-04-02)
84. **Pipeline RLS fix**: Added `SUPABASE_SERVICE_ROLE_KEY` to GitHub Actions workflow `.env` + GitHub Secrets. Pipeline was using ANON_KEY → RLS blocked INSERT (42501). SERVICE_ROLE_KEY bypasses RLS (2026-04-03)
85. **Subtitle position fix**: Added `original_size=1080x1920` to FFmpeg subtitles filter. Without this, renderer used pre-pad resolution → subtitles at center instead of bottom. Font 15→18px for readability (2026-04-03)
86. **Bitrate fix (v2)**: BGM mix step changed from `-c:v libx264` re-encode to `-c:v copy`. libx264 compressed static UI screenshots from 8M→1.47M despite CBR target. Stream copy preserves original 8M bitrate (2026-04-03)
87. **Thumbnail PATH fix**: `thumbnail-generator.ts` was calling bare `ffmpeg` (not in runner PATH). Now uses `ffmpegPath` from `@ffmpeg-installer/ffmpeg` via shared `utils/ffmpeg.ts` (2026-04-03)
88. **Multi-tool retry (A1)**: Pipeline now picks top 3 tools from discovery pool and tries each in order. If tool #1 fails (Gemini error, script reject) → automatically tries tool #2 → tool #3. Only fails pipeline if ALL 3 tools fail. New `pickTopTools()` in tool-discovery.ts (2026-04-03)
89. **Gemini exponential backoff (A2)**: Retry delay upgraded from flat 2s to exponential 3s→6s→12s. Rate limit (429) waits 15s. Transient network errors (ECONNRESET) retry at 2s. Better recovery from API instability (2026-04-03)
90. **Pipeline run logging (A3)**: Orchestrator now writes to `pipeline_runs` table — INSERT at start (status=running), UPDATE at end (completed/failed + duration + error). Dashboard Pipeline History auto-populates (2026-04-03)
91. **Error categorization (A4)**: New `categorizeError()` classifies failures into 7 types: gemini_rate_limit, gemini_api, playwright_timeout, ffmpeg, network, visual_qc, database, unknown. Category included in error_logs + Discord notifications for faster debugging (2026-04-03)

## 🚨 Platform Status (tính đến 2026-04-03)

| Platform | Trạng thái | Chi tiết |
|---|---|---|
| **YouTube** | ✅ **ACTIVE** | OAuth working, daily auto-publish |
| **TikTok** | ❌ **REJECTED** | Content Posting API rejected — UX non-compliance. Dashboard `/publish` has 5-point compliant UX → ready for re-audit |
| **Dashboard** | ✅ **LIVE** | https://vibeytb.vercel.app — Supabase Auth protected, Vercel free tier |

> **TikTok**: Rejected vì thiếu UX (5 points). Dashboard `/publish` page đã build compliant UX → sẵn sàng re-apply.
> **Dashboard**: Live at `vibeytb.vercel.app`. Auth required (Supabase). KHÔNG thay đổi pipeline code.

## 🔄 Đang Xem Xét

### Chuyển từ Self-hosted → GitHub-hosted Runner

**Quyết định**: **GIỮ self-hosted**. GitHub datacenter IP hay bị block khi Playwright recording → ảnh hưởng chất lượng video.

## 📋 Backlog — Cải thiện tiếp theo

| # | Feature | Mô tả | Effort |
|---|---|---|---|
| 1 | **TikTok re-audit** | Screen record `/publish` page → submit lại TikTok Dev Portal | Small |
| 2 | **Engagement tracking** | Theo dõi video nào perform tốt → feed data lại Gemini chọn topic | Medium |
| 3 | **A/B test thumbnails** | Tạo 2 style thumbnail → dùng YouTube API đo CTR | Medium |
| 4 | **Instagram Reels** | Cross-post thêm IG Reels (cùng format 9:16) | Large |
| 5 | **SEO description** | Gemini viết description chuẩn SEO + timestamps | Small |

> **Ưu tiên hiện tại**: Verify pipeline (check verify list below) → TikTok re-audit → Engagement tracking.

### 💰 Monetization Roadmap (khi channel đạt 50-100 videos)

| Phase | Milestone | Action | Thu nhập tiềm năng |
|---|---|---|---|
| 1 | Channel có 50+ videos + số liệu thật | Quay tutorial "How I built YouTube Shorts automation" | $29-79/bản (Gumroad) |
| 2 | Tutorial bán được | Tạo n8n workflow đơn giản hóa (stock video version) | $49-99/bản (Etsy) |
| 3 | Có social proof | Offer done-for-you setup service | $300-500/khách |

> **Quyết định 2026-04-02**: Ưu tiên grow channel → có case study → bán tutorial (hướng dễ nhất, rủi ro thấp nhất).

## ⚠️ Lưu Ý Quan Trọng

- **Google Cloud Console** phải giữ dù chạy ở đâu (YouTube API OAuth)
- **playwright-extra + stealth plugin** KHÔNG tương thích — đừng gợi ý lại
- **Stealth hardening**: 12 anti-bot vectors trong `playwright.ts` via `addInitScript` + Sec-Ch-Ua headers — Agent-1 và Agent-3 tự kế thừa
- **Content Memory**: Tránh trùng lặp tool trong 7 ngày (query Supabase cột `tool_name`)
- **Login Detection threshold**: score >= 2 (URL pattern `/signup` đủ trigger)
- **Data sources**: 1 active source — Gemini AI Search (primary, finds 10+ tools/run). Google CSE code exists but **inactive** (requires Cloud Billing). PH RSS + HN đã bị xóa (2026-03-30)
- **URL Resolution**: Gemini tools có URL sẵn. CSE tools: extract tool name từ article title → resolve via Gemini + Google Search grounding → fallback `guessWebsiteUrl()`
- **URL Verification**: 2-layer (alive + content relevance) — wrong URLs auto-skip
- **Visual cascade**: Website Recording (Layer 1) → Pexels Stock (Layer 3). Layer 2 removed
- **Subtitle overlay**: `Fontname=Arial,Fontsize=18,Bold=1` + `BorderStyle=4` (semi-transparent dark box) + `MarginV=180` (bottom black zone, y≈1740) + `MarginL/R=80` + `original_size=1080x1920` (force padded canvas). Modern viral style, không che website content, tránh YouTube UI
- **SKIP_UPLOAD**: Chỉ active khi `$env:SKIP_UPLOAD='true'` — không ảnh hưởng GitHub Actions
- **UPLOAD_PENDING**: Video produced but upload failed/skipped — set `UPLOAD_PENDING` thay vì `FAILED` để retry sau
- **Video recording**: Viewport 1080×1200 compact desktop → PRE-WARM (load + wait 4s) → FFmpeg `-ss 2` (skip initial frames) → scale 1080w → pad 1080×1920 (9:16). NO horizontal crop → full website visible
- **Interaction UX**: Cursor 48px + click ripple animation, hover 1.2s, hero pause 2.5s. Step 0 shows brand instead of skipping
- **Audio processing**: TTS → `aresample 48000` → stereo → AAC 128k (silenceremove REMOVED — was destroying narration)
- **OAuth scopes**: YouTube token needs BOTH `youtube.upload` + `youtube.force-ssl` (for comments). Run `get-youtube-token.ts` to regenerate
- **Google CSE**: **INACTIVE** — requires Google Cloud Billing account. Code kept, fails gracefully (pipeline uses Gemini Search only). To re-enable: activate billing → set `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` in GitHub Secrets
- **Pre-commit hook**: Mọi commit đều phải pass smoke test — KHÔNG bypass bằng `--no-verify`
- **Dashboard Auth**: Supabase Auth (email/password). Middleware protects all routes except `/login` and `/auth/*`. User created in Supabase Dashboard → Authentication → Users
- **Dashboard Deploy**: Vercel free tier at `vibeytb.vercel.app`. Env vars set via `vercel env`. Redeploy: `cd vibeytb && vercel --prod --yes`
- **PROJECT_CONTEXT.md**: File này phải được cập nhật sau MỌI thay đổi quan trọng. Khi thêm item mới, **PHẢI kiểm tra** phần "Lưu Ý Quan Trọng" xem có dòng nào bị stale/mâu thuẫn với thay đổi mới → fix ngay trong cùng commit
- **Multi-tool retry**: Pipeline thử top 3 tools lần lượt. Nếu Gemini 429 → tool #2 chạy sau 5s delay. Nếu cả 3 fail → job FAILED với `[multi-tool-retry]` tag
- **Pipeline run logging**: Mỗi run ghi vào `pipeline_runs` table. Dashboard Pipeline History tự hiển thị. Non-critical — nếu DB insert fail, pipeline vẫn chạy bình thường
- **Error categorization**: Error logs giờ có prefix `[category]` (VD: `[gemini_rate_limit] 429 quota exceeded`). Discord cũng hiển thị category

## 🧪 Testing

```bash
npx vitest run       # 18 tests (2 test files), <4s, zero API calls
```

| Test Group | Count | What it catches |
|---|---|---|
| Import Chain | 2 | Broken imports, missing modules |
| Status Transitions | 3 | Missing/invalid VideoStatus enum values |
| Path Helpers | 2 | Wrong tmp/video paths |
| Error Handler | 2 | `failJob` not called before `cleanupTmp` |
| Self-Healing | 1 | Missing Phase 3 re-run when video file absent |
| envFlag Parser | 1 | Env flag not handling truthy values |
| Baseline | 2 | Basic sanity checks |

## 🔎 Verify Checklist — Pipeline Run Ngày 2026-04-03

> Run #41 kết quả: 3/6 pass (subtitle FAIL, bitrate FAIL, thumbnail FAIL). Fixes applied in commit TBD.

- [x] **Subtitle position**: ~~FAIL (Run #41 — subtitle ở giữa)~~ → Fixed: `original_size=1080x1920` forces padded canvas
- [x] **Scene 1 website recording**: ✅ PASS (Run #41 — dust.tt hero visible)
- [x] **Thumbnail generate OK**: ~~FAIL (ffmpeg not in PATH)~~ → Fixed: `ffmpegPath` from `@ffmpeg-installer`
- [x] **Bitrate ≥ 5 Mbps**: ~~FAIL (1.47 Mbps)~~ → Fixed: `-c:v copy` in BGM mix
- [x] **Scene 1 narration ≥ 15 words**: ✅ PASS (Run #41)
- [x] **TikTok skip gracefully**: ✅ PASS (Run #41 — immediate skip, no retry)

> **Next**: Re-run pipeline (Run #43) to verify all 6/6 pass.

## 🖥️ Dashboard v1.2 Bug Fixes (2026-04-03)

| Bug | Fix | File |
|---|---|---|
| B1 Mobile locked out | Added hamburger menu + backdrop overlay | `ConditionalLayout.tsx`, `Sidebar.tsx`, `globals.css` |
| B2 Views/Likes all 0 | Analytics tracker now scans ALL untracked published videos (not just 24-48h window) | `analytics-tracker.ts` |
| B2b Missing env key | Added `SUPABASE_SERVICE_ROLE_KEY` to analytics pipeline | `analytics-pipeline.yml` |
| B3 youtube_title null | Orchestrator now saves title/desc/tags on publish | `the-orchestrator.ts` |
| B5 Per-page stats | Videos page now fetches global published/failed counts from summary API | `videos/page.tsx` |
| B4, B6 | Auto-fixed by B2 and B3 respectively | — |

## 🚀 Pipeline Quality v2.0 (2026-04-04)

### Phase 1 — Critical Fixes (Completed)

| Task | Problem | Fix | File |
|------|---------|-----|------|
| F1 Thumbnail crash | `drawtext` filter crashes on portrait→landscape in single pass | Split into 2-pass FFmpeg: (1) extract+scale frame → PNG, (2) overlay graphics → JPG | `thumbnail-generator.ts` |
| F2 Generic queries | Input Hunter typed "Show me how this works" for ALL tools | Enhanced Gemini prompt to generate tool-specific demo queries + updated fallback text | `generator.ts`, `playwright-recorder.ts` |

### Phase 2 — Quality Improvements (Completed)

| Task | Problem | Fix | File |
|------|---------|-----|------|
| F3 Subtitle readability | Subtitles overlap website text animations | Darker BackColour (A0), deeper MarginV (200), smaller font (17) | `media-stitcher.ts` |
| F4 Result wait | Static 20s idle wait after typing query | Smart content-change detection + DemoHunter scroll through results | `playwright-recorder.ts` |

### Phase 3 — Growth (Future)

| Task | Status |
|------|--------|
| F5 Analytics-driven scoring | ⏳ Needs analytics data |
| F6 TikTok re-audit | ✅ UX fixes applied + audit submitted (2026-04-04) — awaiting TikTok approval |

### TikTok UX Compliance Fix (2026-04-04)

| # | Issue (Rejection Point) | Fix Applied | File |
|---|------------------------|-------------|------|
| 1 | Comment/Duet/Stitch default ON | Changed `useState(true)` → `useState(false)` for all 3 toggles | `publish/page.tsx` |
| 2 | Disclosure sub-options always visible | Added parent toggle "Enable Content Disclosure" — sub-options only show when ON | `publish/page.tsx` |
| 3 | No Private mode behavior | Added `useEffect` to auto-disable interactions when `SELF_ONLY`, grayed-out UI + warning text | `publish/page.tsx` |
| 4 | Missing declaration text | Added conditional declaration boxes (yellow=Branded, blue=YourBrand) with TikTok policy links | `publish/page.tsx` |

### Pipeline Quality v3.0 (2026-04-06)

| # | Issue | Fix Applied | File |
|---|-------|-------------|------|
| P1 | Thumbnail crash (FFmpeg drawtext emoji) | Removed emoji from badge, strip non-ASCII in escapeDrawtext | `thumbnail-generator.ts` |
| P2 | Low bitrate (2.74 Mbps vs 8M target) | CBR 8M → CRF 18 quality-based encoding | `media-stitcher.ts` |
| P3 | Repetitive scenes (all show hero) | Per-scene scroll offset (0/30/60/85%) in Smart Interact | `playwright-recorder.ts` |
| P4 | Google CSE 403 errors | Disabled CSE function, Gemini Search only | `tool-discovery.ts` |
| P5 | Subtitles at TOP instead of bottom | VTT cues missing `line:` → FFmpeg default=top. Added `line:90%` | `tts-client.ts` |
| HK | Git commit hangs | `core.hooksPath` + `.husky/_` bị mất khi unset. Re-init từ git root + `npx`→`node` | `.husky/pre-commit` |
| WF | Analytics chạy 2 lần/ngày (thừa) | Gộp vào Daily Pipeline (step trước pipeline, `continue-on-error`) | `daily-pipeline.yml` |
