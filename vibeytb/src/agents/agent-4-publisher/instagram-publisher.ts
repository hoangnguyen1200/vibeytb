/**
 * Instagram Reels Publisher — via Graph API v25.0
 *
 * Publishes video as Instagram Reel using the Content Publishing API:
 * 1. Upload video to Facebook's rupload endpoint → get public URL
 * 2. Create media container (REELS) with video URL + caption
 * 3. Poll container status until FINISHED
 * 4. Publish media container
 *
 * Requires: FB_PAGE_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID in .env
 * (Same token as Facebook — must include instagram_content_publish scope)
 *
 * Phase / Step: Phase 2 → Batch 4 (Instagram Cross-Posting)
 */
import * as fs from 'fs';
import { TOOLS_PAGE_URL, CHANNEL_HANDLE, DEFAULT_HASHTAGS } from '../../utils/branding';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const RUPLOAD_API = 'https://rupload.facebook.com/video-upload/v25.0';

// ─── Config ─────────────────────────────────────────────────────────────────

function getConfig() {
  const igAccountId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN; // Same token — has IG scopes
  const pageId = process.env.FB_PAGE_ID;

  if (!igAccountId || !token || !pageId) {
    return null;
  }

  return { igAccountId, token, pageId };
}

/**
 * Check if Instagram publishing is configured.
 */
export function isInstagramConfigured(): boolean {
  return !!(process.env.IG_BUSINESS_ACCOUNT_ID && process.env.FB_PAGE_ACCESS_TOKEN);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IGReelResult {
  success: boolean;
  mediaId?: string;
  permalink?: string;
  error?: string;
}

// ─── Upload video to Facebook for hosting ───────────────────────────────────

/**
 * Upload video to Facebook Page (unpublished) to get a hosted URL.
 * Instagram API requires a publicly accessible video URL.
 * We use Facebook's upload as temporary hosting.
 */
async function uploadVideoForHosting(
  pageId: string,
  token: string,
  videoPath: string,
): Promise<string> {
  const videoBuffer = fs.readFileSync(videoPath);
  const fileSize = videoBuffer.length;

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
    throw new Error(`FB video init failed: ${JSON.stringify(err)}`);
  }

  const initData = await initRes.json() as {
    video_id: string;
    upload_session_id: string;
    start_offset: string;
    end_offset: string;
  };

  // Step 2: Upload binary
  let currentStart = parseInt(initData.start_offset, 10);
  let currentEnd = parseInt(initData.end_offset, 10);

  while (currentStart < fileSize) {
    const chunk = videoBuffer.subarray(currentStart, currentEnd);
    const formData = new FormData();
    formData.append('upload_phase', 'transfer');
    formData.append('upload_session_id', initData.upload_session_id);
    formData.append('start_offset', String(currentStart));
    formData.append('access_token', token);
    formData.append('video_file_chunk', new Blob([chunk]), 'video.mp4');

    const transferRes = await fetch(`${GRAPH_API}/${pageId}/videos`, {
      method: 'POST',
      body: formData,
    });

    if (!transferRes.ok) {
      const err = await transferRes.json();
      throw new Error(`FB video transfer failed: ${JSON.stringify(err)}`);
    }

    const transferData = await transferRes.json() as {
      start_offset: string;
      end_offset: string;
    };
    currentStart = parseInt(transferData.start_offset, 10);
    currentEnd = parseInt(transferData.end_offset, 10);
  }

  // Step 3: Finish — publish but hide from timeline (no_story=true).
  // Using published=false causes 'source' field to be unavailable.
  const finishRes = await fetch(`${GRAPH_API}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'finish',
      upload_session_id: initData.upload_session_id,
      published: true,
      no_story: true, // Don't show on Page timeline — just for IG hosting
      access_token: token,
    }),
  });

  if (!finishRes.ok) {
    const err = await finishRes.json();
    throw new Error(`FB video finish failed: ${JSON.stringify(err)}`);
  }

  // Poll for video source URL — FB needs time to process the upload
  const maxPollAttempts = 12; // 12 × 5s = 60s max
  for (let i = 0; i < maxPollAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const videoInfoRes = await fetch(
      `${GRAPH_API}/${initData.video_id}?fields=source,status&access_token=${token}`,
    );

    if (!videoInfoRes.ok) continue;

    const videoInfo = await videoInfoRes.json() as {
      source?: string;
      status?: { video_status?: string };
    };

    if (videoInfo.source) {
      return videoInfo.source;
    }

    const status = videoInfo.status?.video_status || 'processing';
    console.log(`  📸 IG: FB video processing (${status}, ${i + 1}/${maxPollAttempts})...`);

    if (status === 'error') {
      throw new Error('FB video processing failed');
    }
  }

  throw new Error('FB video source URL not available after 60s');
}

// ─── Instagram Reel Publishing ──────────────────────────────────────────────

/**
 * Publish a video as an Instagram Reel.
 *
 * Flow: Upload to FB → Create IG container → Poll status → Publish
 */
export async function publishInstagramReel(
  videoPath: string,
  caption: string,
): Promise<IGReelResult> {
  const config = getConfig();
  if (!config) {
    console.log('  ⏭ Instagram not configured — skipping Reel');
    return { success: false, error: 'IG not configured' };
  }

  const { igAccountId, token, pageId } = config;
  const maxRetries = 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`  📸 IG Reel: Attempt ${attempt}/${maxRetries}...`);

      // Step 1: Upload video to Facebook for hosting
      console.log('  📸 IG Reel: Uploading video to FB hosting...');
      const videoUrl = await uploadVideoForHosting(pageId, token, videoPath);
      console.log('  📸 IG Reel: Video hosted — creating IG container...');

      // Step 2: Create media container
      const containerRes = await fetch(`${GRAPH_API}/${igAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: videoUrl,
          caption: caption.slice(0, 2200), // IG caption max 2200 chars
          share_to_feed: true,
          access_token: token,
        }),
      });

      if (!containerRes.ok) {
        const err = await containerRes.json();
        throw new Error(`Container creation failed: ${JSON.stringify(err)}`);
      }

      const { id: containerId } = await containerRes.json() as { id: string };
      console.log(`  📸 IG Reel: Container ${containerId} — polling status...`);

      // Step 3: Poll container status until FINISHED
      const ready = await pollContainerStatus(igAccountId, containerId, token);
      if (!ready) {
        throw new Error('Container processing timed out');
      }

      // Step 4: Publish
      const publishRes = await fetch(`${GRAPH_API}/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: token,
        }),
      });

      if (!publishRes.ok) {
        const err = await publishRes.json();
        throw new Error(`Publish failed: ${JSON.stringify(err)}`);
      }

      const publishData = await publishRes.json() as { id: string };
      const mediaId = publishData.id;

      // Get permalink
      const permalink = await getMediaPermalink(mediaId, token);
      console.log(`  ✅ IG Reel published: ${permalink || mediaId}`);

      return {
        success: true,
        mediaId,
        permalink: permalink || undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ IG Reel error (attempt ${attempt}/${maxRetries}): ${msg}`);

      if (attempt < maxRetries) {
        const waitMs = attempt * 5000;
        console.log(`  ⏳ Retry in ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  console.error('  ❌ IG Reel: All attempts failed');
  return { success: false, error: `All ${maxRetries} attempts failed` };
}

// ─── Poll Container Status ──────────────────────────────────────────────────

async function pollContainerStatus(
  igAccountId: string,
  containerId: string,
  token: string,
  maxAttempts = 30,
  intervalMs = 5000,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${token}`,
    );

    if (!res.ok) continue;

    const data = await res.json() as { status_code: string; status?: string };
    const status = data.status_code;

    if (status === 'FINISHED') {
      console.log('  📸 IG Reel: Container ready!');
      return true;
    }

    if (status === 'ERROR') {
      throw new Error(`Container processing error: ${data.status || 'unknown'}`);
    }

    console.log(`  ⏳ IG Reel: ${status} (${i + 1}/${maxAttempts})...`);
  }

  return false;
}

// ─── Get Media Permalink ────────────────────────────────────────────────────

async function getMediaPermalink(
  mediaId: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${mediaId}?fields=permalink&access_token=${token}`,
    );
    if (!res.ok) return null;
    const data = await res.json() as { permalink?: string };
    return data.permalink || null;
  } catch {
    return null;
  }
}

// ─── Caption Builder ────────────────────────────────────────────────────────

/**
 * Build Instagram Reel caption (max 2200 chars).
 * Format: Hook → CTA → Hashtags
 */
export function buildInstagramCaption(
  toolName: string,
  hook: string,
  affiliateUrl?: string,
): string {
  const parts = [
    hook,
    '',
    affiliateUrl ? `🔗 Try ${toolName}: ${affiliateUrl}` : `🔗 Try ${toolName}`,
    `🤖 All tools: ${TOOLS_PAGE_URL}`,
    `👉 Follow ${CHANNEL_HANDLE} for daily AI reviews!`,
    '',
    DEFAULT_HASHTAGS,
    `#${toolName.toLowerCase().replace(/[^a-z0-9]/g, '')} #instagram #reels`,
  ].filter(Boolean);

  return parts.join('\n').slice(0, 2200);
}
