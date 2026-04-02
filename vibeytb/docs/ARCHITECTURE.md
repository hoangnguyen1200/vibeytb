# 🏗️ Architecture — VibeYtb Pipeline

> Deep-dive into each pipeline phase, agent responsibilities, and data flow.

---

## Overview

VibeYtb is a **4-phase automated pipeline** that runs daily via GitHub Actions. Each phase is handled by a specialized "agent" — a focused TypeScript module with a single responsibility.

```
Phase 1          Phase 2          Phase 3          Phase 4
Data Mining  →   Strategist   →   Producer    →    Publisher
(find tool)      (write script)   (make video)     (upload)
```

**Orchestrator**: `src/scripts/the-orchestrator.ts` coordinates all phases sequentially.

---

## Phase 1: Data Mining

**Agent**: `agent-1-data-miner/tool-discovery.ts`

### Purpose
Find a trending AI tool that hasn't been covered in the last 7 days.

### Data Sources

| Source | Method | Output |
|---|---|---|
| Gemini AI Search | `generateContent()` with search grounding | 5-10 AI tools with URLs |
| Google Custom Search | REST API (tech sites) | 5-10 results (currently inactive) |

### Pipeline Flow

```
Gemini AI Search → 5-10 tools
     ↓
Merge + deduplicate
     ↓
Filter recently used (7-day window via Supabase)
     ↓
Score each tool (max 100pts)
     ↓
Sort by score descending
     ↓
verifyUrl() → 3-layer check
     ↓
Winner = first tool that passes verification
```

### Scoring Algorithm (`scoreTool()`)

```
URL reliability:  +40 if pre-resolved (gemini-search/google-cse)
Popularity:       0-30 (Gemini rating / CSE baseline)
Tagline quality:  0-15 (length ≥ 40 = 15pts)
Name quality:     0-10 (length ≤ 12 = 10pts)
Video keywords:   +5 ("AI", "free", "automation", etc.)
───────────────────
Max:              100 pts
```

### URL Verification (`verifyUrl()`)

```
Layer 0: Non-product → reject GitHub, Twitter, Medium, Reddit
Layer 1: HTTP alive → status 200-399 (403/503 = Cloudflare but exists)
Layer 2: Content relevance → <title>/<meta> contains tool name
```

### Output
```typescript
interface ToolData {
  name: string;        // e.g., "Mem AI"
  tagline: string;     // e.g., "The AI note-taking app that thinks for you"
  url: string;         // e.g., "https://mem.ai"
  urlSource: 'gemini-search' | 'google-cse' | 'guess';
}
```

---

## Phase 2: Strategist

**Agent**: `agent-2-strategist/generator.ts`

### Purpose
Generate a compelling 3-scene video script using Gemini 2.5 Flash.

### Prompt Design
- Input: Tool name, tagline, URL
- Output: 3-scene script with narration + hook text
- Constraints:
  - Scene 1 hook: minimum 15-25 words
  - American English, conversational tone
  - Total video: 30-60 seconds

### Script Structure

```typescript
interface VideoScript {
  title: string;           // YouTube title (≤100 chars)
  description: string;     // YouTube description with hashtags
  scenes: Scene[];         // 3 scenes
}

interface Scene {
  narration: string;       // TTS text
  hookText?: string;       // Scene 1 only — overlay text
  duration: number;        // Estimated seconds
  visualDirection: string; // Instructions for recording
}
```

### Output
JSON file saved to `tmp/{jobId}/script.json`

---

## Phase 3: Producer

**Agent**: `agent-3-producer/` (multiple modules)

### Purpose
Transform script into a polished 9:16 video with narration, website recording, subtitles, and BGM.

### Sub-modules

#### 3.1 TTS Client (`tts-client.ts`)
- **Engine**: Edge TTS (Microsoft)
- **Voice**: `en-US-AndrewNeural`
- **Output**: WAV audio per scene + VTT subtitle file
- **Retry**: 3 attempts with exponential backoff

#### 3.2 Playwright Recorder (`playwright-recorder.ts`)
- **Browser**: Chromium (headless)
- **Viewport**: 1080×1200 (compact desktop)
- **Stealth**: 12 anti-bot vectors via `addInitScript`:
  - WebDriver property removal
  - Chrome runtime mock
  - Permissions API override
  - Languages/plugins spoofing
  - WebGL vendor masking
  - Canvas fingerprint noise
  - Sec-Ch-Ua headers

##### Recording Flow
```
Page load
  ↓ Pre-warm (4s) — wait for full render
  ↓ Start recording (video context)
  ↓ FFmpeg -ss 2 — skip initial blank frames
  ↓ Scroll interaction (smooth, with cursor animation)
  ↓ Click CTA button (if found)
  ↓ Hero pause (2.5s)
  ↓ Stop recording
Output: WebM video
```

##### Visual Cascade (Fallback)
```
Layer 1: Record actual website (Playwright)
  ↓ Visual QC fail?
Layer 3: Pexels stock video (search by tool name)
```

#### 3.3 Visual QC (`visual-qc.ts`)
- **Engine**: Gemini Vision
- **Input**: Screenshot from recorded video
- **Check**: Is the recording showing real website content? (not blank, not login wall, not error page)

#### 3.4 Media Stitcher (`media-stitcher.ts`)
- **Engine**: FFmpeg (raw filtergraph, not fluent-ffmpeg for complex operations)

##### Video Processing Pipeline
```
Input: 1080×1200 WebM recording
  ↓ scale to 1080px width
  ↓ pad to 1080×1920 (black bars, centered)
  ↓ burn subtitles (ASS format, bottom zone MarginV=180)
  ↓ hook text overlay (Scene 1, drawtext, fade in/out)
  ↓ encode: libx264, 8M CBR, -minrate 6M
  ↓ audio: aresample 48kHz → stereo → AAC 128k
Per-scene video files
  ↓ concat filter (re-encode for consistency)
  ↓ amix BGM at 15% volume
  ↓ loudnorm -16 LUFS
Output: final_video.mp4 (1080×1920, 9:16, 30-60s)
```

##### Subtitle Styling
```
Fontname=Arial, Fontsize=15, Bold=1
BorderStyle=4 (semi-transparent dark box)
PrimaryColour=white, BackColour=80% black
MarginV=180 (bottom black padding zone, y≈1740)
MarginL/R=80 (side padding)
Alignment=2 (bottom-center)
```

#### 3.5 Outro Generator (`outro-generator.ts`)
- Creates 3-second CTA clip using FFmpeg drawtext
- Content: "Try {tool_name} → Link in description"
- Style: White text on dark background with fade

#### 3.6 BGM Picker (`pixabay-client.ts`)
- Picks random BGM from local `assets/bgm/` directory
- No API calls — fully offline

---

## Phase 4: Publisher

**Agent**: `agent-4-publisher/` (multiple modules)

### 4.1 YouTube Uploader (`youtube-uploader.ts`)
- **API**: YouTube Data API v3 (OAuth2)
- **Upload**: Resumable upload protocol
- **Privacy**: Public
- **Post-upload**:
  - Set custom thumbnail (1280×720)
  - Pin comment with CTA link
  - Record video URL in Supabase

### 4.2 Thumbnail Generator (`thumbnail-generator.ts`)
- Extracts frame from final video at T=2s
- Converts 9:16 (1080×1920) → 16:9 (1280×720)
- Uses raw FFmpeg: scale + center-crop

### 4.3 TikTok Uploader (`tiktok-uploader.ts`)
- **API**: TikTok Content Posting API v2
- **Method**: FILE_UPLOAD (direct)
- **Privacy**: SELF_ONLY (during audit) → PUBLIC_TO_EVERYONE (after approval)
- **Error handling**: Detects permanent errors (unaudited_client) → skip without retry

### 4.4 Analytics Tracker (`analytics-tracker.ts`)
- Runs 24 hours after video publish
- Fetches YouTube Data API statistics (views, likes, comments)
- Stores in Supabase `video_projects` table
- Sends summary to Discord webhook

---

## Data Flow

```
Supabase DB
┌──────────────────────────────────────────────┐
│ video_projects table                         │
│                                              │
│  id | tool_name | status    | youtube_url    │
│  ───┼───────────┼───────────┼────────────── │
│  1  | Mem AI    | PUBLISHED | youtu.be/xxx   │
│  2  | Notion    | PRODUCED  | null           │
│  3  | Linear    | FAILED    | null           │
└──────────────────────────────────────────────┘

Status transitions:
  PENDING → MINING → SCRIPTING → PRODUCING → UPLOADING → PUBLISHED
                                                       → UPLOAD_PENDING (upload failed, video exists)
                                           → FAILED (any phase)
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Self-hosted runner | Residential IP avoids bot detection during Playwright recording |
| Edge TTS over ElevenLabs | Free, no API key, good quality for short-form |
| FFmpeg raw filtergraph | More reliable than fluent-ffmpeg for complex filter chains |
| Concat filter over demuxer | Re-encodes for consistent audio/video across scenes |
| MarginV=180 subtitles | Deep in bottom black padding, avoids website content and YouTube UI |
| 1080×1200 viewport | Wide enough for desktop layout (>1024px breakpoint), compact height for mobile-first video |
| 7-day content memory | Prevents same tool twice in a week (Supabase query) |
| Sequential Phase 4 | YouTube first → TikTok second, graceful fallback if either fails |
