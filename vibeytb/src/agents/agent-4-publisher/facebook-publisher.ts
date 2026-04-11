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
        file_url: videoPath,
        'Content-Length': String(videoBuffer.length),
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

// ─── Video Post Upload (resumable) ─────────────────────────────────────────

export interface PostResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Publish a video as a regular Facebook Post with text description.
 * Uses Resumable Upload API for reliability.
 */
export async function publishFacebookPost(
  videoPath: string,
  title: string,
  description: string,
): Promise<PostResult> {
  const config = getConfig();
  if (!config) {
    console.log('  ⏭ Facebook not configured — skipping Post');
    return { success: false, error: 'FB not configured' };
  }

  const { pageId, token } = config;

  try {
    const fileSize = fs.statSync(videoPath).size;
    const fileName = path.basename(videoPath);

    console.log(`  📝 FB Post: Starting upload (${(fileSize / 1024 / 1024).toFixed(1)} MB)...`);

    // Step 1: Init upload session
    const initRes = await fetch(`${GRAPH_API}/${pageId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'start',
        file_size: fileSize,
        access_token: token,
      }),
    });

    if (!initRes.ok) {
      const err = await initRes.json();
      throw new Error(`Init failed: ${JSON.stringify(err)}`);
    }

    const { upload_session_id, start_offset, end_offset } = await initRes.json() as {
      upload_session_id: string;
      start_offset: string;
      end_offset: string;
    };

    console.log(`  📝 FB Post: Session ${upload_session_id} — transferring...`);

    // Step 2: Upload video in chunks
    let currentStart = parseInt(start_offset, 10);
    let currentEnd = parseInt(end_offset, 10);

    while (currentStart < fileSize) {
      const chunk = fs.readFileSync(videoPath).subarray(currentStart, currentEnd);

      const formData = new FormData();
      formData.append('upload_phase', 'transfer');
      formData.append('upload_session_id', upload_session_id);
      formData.append('start_offset', String(currentStart));
      formData.append('access_token', token);
      formData.append('video_file_chunk', new Blob([chunk]), fileName);

      const transferRes = await fetch(`${GRAPH_API}/${pageId}/videos`, {
        method: 'POST',
        body: formData,
      });

      if (!transferRes.ok) {
        const err = await transferRes.json();
        throw new Error(`Transfer failed: ${JSON.stringify(err)}`);
      }

      const transferData = await transferRes.json() as {
        start_offset: string;
        end_offset: string;
      };

      currentStart = parseInt(transferData.start_offset, 10);
      currentEnd = parseInt(transferData.end_offset, 10);
    }

    console.log('  📝 FB Post: Transfer complete — publishing...');

    // Step 3: Finish + publish
    const finishRes = await fetch(`${GRAPH_API}/${pageId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'finish',
        upload_session_id,
        title,
        description,
        access_token: token,
      }),
    });

    if (!finishRes.ok) {
      const err = await finishRes.json();
      throw new Error(`Finish failed: ${JSON.stringify(err)}`);
    }

    const finishData = await finishRes.json() as { success: boolean; post_id?: string };
    if (finishData.success) {
      const postId = finishData.post_id || 'unknown';
      console.log(`  ✅ FB Post published: ${postId}`);
      return { success: true, postId };
    }

    throw new Error('Finish returned success=false');
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
 * Build long Post description with review text + links.
 */
export function buildPostDescription(
  toolName: string,
  reviewText: string,
  affiliateUrl?: string,
): string {
  const parts = [
    reviewText,
    '',
    '━━━━━━━━━━━━━━',
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
