# VibeYtb — Project Context & Status

> **Đọc file này ĐẦU TIÊN** khi bắt đầu session mới.
> Cập nhật lần cuối: 2026-03-31 (Subtitle redesign — modern viral style)

---

## 🎯 Dự Án Là Gì?

**YouTube Automation Pipeline** — tự động tạo video Shorts review AI tools cho kênh **@TechHustleLabs**.

Pipeline 4 phase:
1. **Data Mining**: Tìm tool AI mới (Gemini AI Search + Google Custom Search API)
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
  ├── Phase 1: Gemini AI Search + Google Custom Search API → pickBestTool()
  ├── Phase 2: Gemini script generation (với real tool data)
  ├── Phase 3: Edge TTS + Playwright 1920×1080 + FFmpeg center-crop → 1080×1920
  └── Phase 4: YouTube upload via OAuth + TikTok cross-post (best-effort)
```

### Phase 1: Data Mining (1 active source)

```
  Source 1 (Primary):   Gemini AI Search → 5-10 AI tools + URLs
  Source 2 (Secondary): Google Custom Search API → 5-10 results from tech sites
  → Merge → Filter recently used
  → Score (URL reliability + popularity + tagline + name + keywords)
  → Sort by score → verifyUrl() → 1 winner
  Fallback: discoverFreshTopic() → guessWebsiteUrl()
```

> `urlSource` field tracks which source: `'gemini-search'` | `'google-cse'` | `'guess'`
> PH RSS + HN scrapers **removed** (2026-03-30): PH blocked by CF, HN = GitHub repos + non-AI
> Google CSE **inactive** (2026-03-31): Requires Google Cloud Billing (user declined). Code kept for future use, fails gracefully → pipeline uses Gemini only

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
Playwright recording 1920×1080 (desktop viewport)
  ↓ FFmpeg crop
crop center 1080×1080 (cắt 2 bên, giữ trung tâm)
  ↓ FFmpeg pad
pad 1080×1920 (thêm đen trên/dưới → 9:16 portrait)
  ↓ subtitles + silenceremove + concat
Final video 1080×1920 9:16
```

> Website hiển thị **desktop layout** (không mobile). Text/UI giữ nguyên resolution.

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
| `src/agents/agent-3-producer/media-stitcher.ts` | FFmpeg video assembly (center-crop 1080×1920, BGM 15%) |
| `src/agents/agent-3-producer/outro-generator.ts` | 3s outro CTA clip (FFmpeg drawtext) |
| `src/agents/agent-4-publisher/youtube-uploader.ts` | YouTube upload + pinned comment CTA + thumbnail |
| `src/agents/agent-4-publisher/thumbnail-generator.ts` | Auto-generate 1280×720 thumbnail from video frame |
| `src/agents/agent-4-publisher/tiktok-uploader.ts` | TikTok cross-post via Content Posting API (OAuth2 + FILE_UPLOAD) |
| `src/scripts/orchestrator.smoke.test.ts` | Smoke test (18 tests, <3s, zero API calls) |
| `.husky/pre-commit` | Pre-commit hook → chạy vitest trước mỗi commit |
| `.github/workflows/smoke-test.yml` | CI smoke test trên push/PR to main |

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
- Fallback model: `gemini-1.5-flash-latest` (khi 2.5 Flash bị 429)

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

## 🚨 Platform Status (tính đến 2026-03-27 21:14)

| Platform | Trạng thái | Chi tiết |
|---|---|---|
| **YouTube** | ✅ **RESTORED** | Appeal approved 20:43 27/03. Cần verify: đăng nhập lại + kiểm tra refresh token |
| **TikTok** | ⏳ **PENDING APPROVAL** | Content Posting API đã submit — đang chờ TikTok approve |

> **YouTube**: Account khôi phục nhưng cần kiểm tra OAuth refresh token có còn valid không. Nếu bị revoke → chạy lại OAuth flow để lấy token mới.
> **TikTok**: Vẫn chờ approve — pipeline tự skip graceful.

## 🔄 Đang Xem Xét

### Chuyển từ Self-hosted → GitHub-hosted Runner

**Quyết định**: **GIỮ self-hosted**. GitHub datacenter IP hay bị block khi Playwright recording → ảnh hưởng chất lượng video.

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
- **Subtitle overlay**: `Fontname=Arial,Fontsize=14,Bold=1` + `BorderStyle=4` (semi-transparent dark box) + `MarginV=320` (bottom black zone, y≈1600) + `MarginL/R=80` — modern viral style, không che website content
- **SKIP_UPLOAD**: Chỉ active khi `$env:SKIP_UPLOAD='true'` — không ảnh hưởng GitHub Actions
- **UPLOAD_PENDING**: Video produced but upload failed/skipped — set `UPLOAD_PENDING` thay vì `FAILED` để retry sau
- **Video recording**: Viewport 1920×1080 desktop → FFmpeg `-ss 2` (skip blank page load) → scale-up (if <1080px) → crop center → pad 1080×1920 (9:16)
- **Audio processing**: TTS → `silenceremove` (trim trailing silence) → `aresample 48000` → stereo → AAC 128k
- **OAuth scopes**: YouTube token needs BOTH `youtube.upload` + `youtube.force-ssl` (for comments). Run `get-youtube-token.ts` to regenerate
- **Google CSE**: **INACTIVE** — requires Google Cloud Billing account. Code kept, fails gracefully (pipeline uses Gemini Search only). To re-enable: activate billing → set `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` in GitHub Secrets
- **Pre-commit hook**: Mọi commit đều phải pass smoke test — KHÔNG bypass bằng `--no-verify`
- **PROJECT_CONTEXT.md**: File này phải được cập nhật sau MỌI thay đổi quan trọng. Khi thêm item mới, **PHẢI kiểm tra** phần "Lưu Ý Quan Trọng" xem có dòng nào bị stale/mâu thuẫn với thay đổi mới → fix ngay trong cùng commit

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
