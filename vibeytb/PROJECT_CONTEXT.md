# VibeYtb — Project Context & Status

> **Đọc file này ĐẦU TIÊN** khi bắt đầu session mới.
> Cập nhật lần cuối: 2026-03-30 (Multi-source + remove Layer 2 + URL verify)

---

## 🎯 Dự Án Là Gì?

**YouTube Automation Pipeline** — tự động tạo video Shorts review AI tools cho kênh **@TechHustleLabs**.

Pipeline 4 phase:
1. **Data Mining**: Tìm tool AI mới (Product Hunt RSS → fallback LLM keyword)
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
  ├── Phase 1: PH RSS Feed → pickBestTool() → Gemini URL Resolution
  ├── Phase 2: Gemini script generation (với real tool data)
  ├── Phase 3: Edge TTS + Playwright 1920×1080 + FFmpeg center-crop → 1080×1920
  └── Phase 4: YouTube upload via OAuth + TikTok cross-post (best-effort)
```

### URL Resolution Chain (Phase 1)

```
PH RSS Feed → tên tool + PH product URL + redirect URL (/r/p/<id>)
  ↓
pickBestTool() → chọn 1 tool (tránh trùng 7 ngày)
  ↓
Plan A: Follow /r/p/<id> redirect via HTTP fetch → URL thật (NO browser, NO Cloudflare)
  ↓ nếu redirect fail
Plan B: resolveUrlViaGemini(name, tagline) + Google Search grounding
  ↓ nếu Gemini fail (429/timeout/UNKNOWN)
Plan C: guessWebsiteUrl(name) → URL đoán từ tên (last resort)
```

> `urlSource` field tracks which plan succeeded: `'ph-redirect'` | `'gemini'` | `'guess'` | `'hackernews'` | `'gemini-search'`

### URL Verification (2-layer)

```
verifyUrl(url, toolName):
  Layer 1: HTTP check → site alive? (200-399 or 403/503 = CF but exists)
  Layer 2: Content relevance → page <title>/<meta> chứa tên tool?
  → ✅ alive + relevant → OK
  → ❌ dead or wrong site → skip, try next tool
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
| `src/agents/agent-1-data-miner/scraper-producthunt.ts` | PH RSS scraper + Gemini URL resolution |
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
| `src/scripts/orchestrator.smoke.test.ts` | Smoke test (13 tests, <3s, zero API calls) |
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
- **Content Memory**: Tránh trùng lặp tool trong 7 ngày (query Supabase)
- **Login Detection threshold**: score >= 2 (URL pattern `/signup` đủ trigger)
- **Data sources**: 3 sources — PH RSS (primary), HN "Show HN" API, Gemini AI Search
- **URL Resolution**: PH tools: redirect → Gemini → guess. HN/Gemini tools: URL sẵn có
- **URL Verification**: 2-layer (alive + content relevance) — wrong URLs auto-skip
- **Visual cascade**: Website Recording (Layer 1) → Pexels Stock (Layer 3). Layer 2 removed
- **SKIP_UPLOAD**: Chỉ active khi `$env:SKIP_UPLOAD='true'` — không ảnh hưởng GitHub Actions
- **UPLOAD_PENDING**: Video produced but upload failed/skipped — set `UPLOAD_PENDING` thay vì `FAILED` để retry sau
- **Video recording**: Viewport 1920×1080 desktop → FFmpeg scale-up (if <1080px) → crop center → pad 1080×1920 (9:16)
- **Pre-commit hook**: Mọi commit đều phải pass smoke test — KHÔNG bypass bằng `--no-verify`
- **PROJECT_CONTEXT.md**: File này phải được cập nhật sau MỌI thay đổi quan trọng

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
