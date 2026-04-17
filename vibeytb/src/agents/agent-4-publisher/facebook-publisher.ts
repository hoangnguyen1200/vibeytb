/**
 * Facebook Page Publisher — Reel + Post with Video
 *
 * Publishes content to Facebook Page via Graph API v25.0:
 * 1. Reel: Short video (9:16) with caption + hashtags
 * 2. Post: Video with review text + affiliate link
 *
 * Requires: FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN in .env
 */
import * as fs from 'fs';
import * as path from 'path';
import { TOOLS_PAGE_URL, CHANNEL_HANDLE, AFFILIATE_DISCLOSURE, DEFAULT_HASHTAGS } from '../../utils/branding';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const RUPLOAD_API = 'https://rupload.facebook.com/video-upload/v25.0';

function getConfig() {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;

  if (!pageId || !token) {
    return null;
  }

  return { pageId, token };
}

// ─── Reel Upload (3-step process) ──────────────────────────────────────────

export interface ReelResult {
  success: boolean;
  videoId?: string;
  error?: string;
}

/**
 * Publish a video as a Facebook Reel.
 * Video must be 9:16 aspect ratio, 3-90 seconds.
 */
export async function publishFacebookReel(
  videoPath: string,
  caption: string,
): Promise<ReelResult> {
  const config = getConfig();
  if (!config) {
    console.log('  ⏭ Facebook not configured — skipping Reel');
    return { success: false, error: 'FB not configured' };
  }

  const { pageId, token } = config;

  try {
    console.log('  📱 FB Reel: Initializing upload...');

    // Step 1: Init upload session
    const initRes = await fetch(`${GRAPH_API}/${pageId}/video_reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'start',
        access_token: token,
      }),
    });

    if (!initRes.ok) {
      const err = await initRes.json();
      throw new Error(`Init failed: ${JSON.stringify(err)}`);
    }

    const { video_id } = await initRes.json() as { video_id: string };
    console.log(`  📱 FB Reel: Video ID ${video_id} — uploading binary...`);

    // Step 2: Upload video binary
    const videoBuffer = fs.readFileSync(videoPath);
    const uploadRes = await fetch(`${RUPLOAD_API}/${video_id}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        'Content-Type': 'application/octet-stream',
        offset: '0',
        file_size: String(videoBuffer.length),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      throw new Error(`Upload failed: ${JSON.stringify(err)}`);
    }

    console.log('  📱 FB Reel: Binary uploaded — publishing...');

    // Step 3: Publish
    const publishRes = await fetch(`${GRAPH_API}/${pageId}/video_reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'finish',
        video_id,
        video_state: 'PUBLISHED',
        description: caption,
        access_token: token,
      }),
    });

    if (!publishRes.ok) {
      const err = await publishRes.json();
      throw new Error(`Publish failed: ${JSON.stringify(err)}`);
    }

    const publishData = await publishRes.json() as { success: boolean };
    if (publishData.success) {
      console.log(`  ✅ FB Reel published: ${video_id}`);
      return { success: true, videoId: video_id };
    }

    throw new Error('Publish returned success=false');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ FB Reel failed: ${msg}`);
    return { success: false, error: msg };
  }
}

// ─── Photo Post Upload (multi-photo + text) ────────────────────────────────

export interface PostResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Extract 3 screenshots from a video at 25%, 50%, 75% timestamps.
 * Uses FFmpeg to capture high-quality frames for FB photo post.
 * Returns array of image file paths.
 */
export async function extractPostScreenshots(
  videoPath: string,
  outputDir: string,
): Promise<string[]> {
  const { execSync } = await import('child_process');
  const { ffmpegPath } = await import('../../utils/ffmpeg');

  const safeFfmpeg = ffmpegPath.replace(/\\/g, '/');
  const safeInput = videoPath.replace(/\\/g, '/');
  const screenshots: string[] = [];

  // Get video duration
  const probeCmd = `"${safeFfmpeg}" -i "${safeInput}" 2>&1 | findstr Duration`;
  let durationSec = 40; // fallback
  try {
    const probeOut = execSync(probeCmd, { encoding: 'utf-8', shell: 'cmd.exe' });
    const match = probeOut.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      durationSec = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
    }
  } catch { /* use fallback duration */ }

  const timestamps = [0.25, 0.50, 0.75];
  for (let i = 0; i < timestamps.length; i++) {
    const seekTime = Math.floor(durationSec * timestamps[i]);
    const outPath = path.join(outputDir, `fb_screenshot_${i + 1}.jpg`).replace(/\\/g, '/');
    const cmd = [
      `"${safeFfmpeg}"`,
      '-y',
      `-ss ${seekTime}`,
      `-i "${safeInput}"`,
      '-frames:v 1',
      '-vf "scale=1080:1920:force_original_aspect_ratio=decrease"',
      '-q:v 2',
      `"${outPath}"`,
    ].join(' ');

    try {
      execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 });
      screenshots.push(outPath.replace(/\//g, path.sep));
    } catch (err) {
      console.warn(`  ⚠ Screenshot ${i + 1} extraction failed — skipping`);
    }
  }

  console.log(`  📸 FB Post: Extracted ${screenshots.length} screenshots`);
  return screenshots;
}

/**
 * Publish a multi-photo post with text description on Facebook Page.
 * Flow: Upload each photo unpublished → create feed post with attached_media[].
 * Replaces the old video post to avoid duplicate content with Reel.
 */
export async function publishFacebookPost(
  screenshots: string[],
  description: string,
): Promise<PostResult> {
  const config = getConfig();
  if (!config) {
    console.log('  ⏭ Facebook not configured — skipping Post');
    return { success: false, error: 'FB not configured' };
  }

  const { pageId, token } = config;

  if (screenshots.length === 0) {
    console.warn('  ⚠ No screenshots available — skipping FB photo post');
    return { success: false, error: 'No screenshots' };
  }

  try {
    console.log(`  📝 FB Post: Uploading ${screenshots.length} photos...`);

    // Step 1: Upload each photo as unpublished
    const photoIds: string[] = [];
    for (let i = 0; i < screenshots.length; i++) {
      const imgPath = screenshots[i];
      if (!fs.existsSync(imgPath)) {
        console.warn(`  ⚠ Screenshot ${i + 1} not found: ${imgPath}`);
        continue;
      }

      const imgBuffer = fs.readFileSync(imgPath);
      const formData = new FormData();
      formData.append('access_token', token);
      formData.append('published', 'false');
      formData.append('source', new Blob([imgBuffer], { type: 'image/jpeg' }), `screenshot_${i + 1}.jpg`);

      const uploadRes = await fetch(`${GRAPH_API}/${pageId}/photos`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        console.warn(`  ⚠ Photo ${i + 1} upload failed: ${JSON.stringify(err)}`);
        continue;
      }

      const uploadData = await uploadRes.json() as { id: string };
      photoIds.push(uploadData.id);
      console.log(`  📷 Photo ${i + 1} uploaded: ${uploadData.id}`);
    }

    if (photoIds.length === 0) {
      throw new Error('All photo uploads failed');
    }

    // Step 2: Create feed post with attached photos
    const postBody: Record<string, string> = {
      message: description,
      access_token: token,
    };

    // Attach each photo
    photoIds.forEach((id, idx) => {
      postBody[`attached_media[${idx}]`] = JSON.stringify({ media_fbid: id });
    });

    const postRes = await fetch(`${GRAPH_API}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });

    if (!postRes.ok) {
      const err = await postRes.json();
      throw new Error(`Feed post failed: ${JSON.stringify(err)}`);
    }

    const postData = await postRes.json() as { id: string };
    console.log(`  ✅ FB Photo Post published: ${postData.id}`);
    return { success: true, postId: postData.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ FB Post failed: ${msg}`);
    return { success: false, error: msg };
  }
}

// ─── Caption Builders ──────────────────────────────────────────────────────

/**
 * Build short Reel caption (varies each time via hook text).
 */
export function buildReelCaption(
  toolName: string,
  hook: string,
  affiliateUrl?: string,
): string {
  const parts = [
    hook,
    '',
    affiliateUrl ? `🔗 Try ${toolName}: ${affiliateUrl}` : '',
    `🤖 All tools: ${TOOLS_PAGE_URL}`,
    '',
    DEFAULT_HASHTAGS,
    `#${toolName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
  ].filter(Boolean);

  return parts.join('\n');
}

/**
 * Build long Post description with script text + links + optional Reel link.
 * Uses script summary from Phase 2 — zero extra Gemini calls.
 */
export function buildPostDescription(
  toolName: string,
  scriptText: string,
  affiliateUrl?: string,
  reelVideoId?: string,
): string {
  // Format script text as readable review
  const reviewText = scriptText.length > 600
    ? scriptText.slice(0, 600).replace(/\s+\S*$/, '') + '...'
    : scriptText;

  const reelLink = reelVideoId
    ? `🎬 Watch the full video review: https://fb.watch/${reelVideoId}`
    : '';

  const parts = [
    `🤖 ${toolName} — AI Tool Review`,
    '',
    reviewText,
    '',
    '━━━━━━━━━━━━━━',
    reelLink,
    affiliateUrl ? `🔗 Try ${toolName}: ${affiliateUrl}` : '',
    `🤖 All AI tools I recommend: ${TOOLS_PAGE_URL}`,
    `👉 Follow ${CHANNEL_HANDLE} for daily AI tool reviews!`,
    '',
    `📋 ${AFFILIATE_DISCLOSURE}`,
    '',
    DEFAULT_HASHTAGS,
  ].filter(Boolean);

  return parts.join('\n');
}

/**
 * Check if Facebook publishing is configured.
 */
export function isFacebookConfigured(): boolean {
  return !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN);
}
