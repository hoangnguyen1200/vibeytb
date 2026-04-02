/**
 * TikTok Content Posting API v2 — Direct Post via FILE_UPLOAD.
 *
 * Required env vars:
 *   TIKTOK_CLIENT_KEY     — App client key from developers.tiktok.com
 *   TIKTOK_CLIENT_SECRET  — App client secret
 *   TIKTOK_REFRESH_TOKEN  — OAuth2 refresh token (offline scope)
 *
 * Flow: refresh access token → init upload → PUT file → poll publish status
 *
 * Phase / Step: Phase 2 → Batch 3 (TikTok Cross-Posting)
 */

import fs from 'fs';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  token_type: string;
}

interface TikTokInitResponse {
  data: {
    publish_id: string;
    upload_url: string;
  };
  error: {
    code: string;
    message: string;
  };
}

interface TikTokPublishStatusResponse {
  data: {
    status: 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'PUBLISH_COMPLETE' | 'FAILED';
    publicaly_available_post_id?: string[];
    fail_reason?: string;
  };
  error: {
    code: string;
    message: string;
  };
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

async function refreshAccessToken(
  clientKey: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; newRefreshToken: string }> {
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok token refresh failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as TikTokTokenResponse;
  return {
    accessToken: body.access_token,
    newRefreshToken: body.refresh_token,
  };
}

// ─── Init Upload ─────────────────────────────────────────────────────────────

async function initVideoUpload(
  accessToken: string,
  videoSizeBytes: number,
  title: string,
): Promise<{ publishId: string; uploadUrl: string }> {
  const body = {
    post_info: {
      title: title.slice(0, 150), // TikTok max title 150 chars
      privacy_level: 'SELF_ONLY', // Start as private, change to PUBLIC_TO_EVERYONE when ready
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: videoSizeBytes,
      chunk_size: videoSizeBytes, // Single-chunk for files ≤ 50 MB
      total_chunk_count: 1,
    },
  };

  const res = await fetch(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok init upload failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as TikTokInitResponse;
  if (data.error?.code !== 'ok') {
    throw new Error(`TikTok init error: ${data.error.code} — ${data.error.message}`);
  }

  return {
    publishId: data.data.publish_id,
    uploadUrl: data.data.upload_url,
  };
}

// ─── Upload Video Binary ─────────────────────────────────────────────────────

async function uploadVideoFile(
  uploadUrl: string,
  videoPath: string,
  videoSizeBytes: number,
): Promise<void> {
  const fileBuffer = fs.readFileSync(videoPath);

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoSizeBytes),
      'Content-Range': `bytes 0-${videoSizeBytes - 1}/${videoSizeBytes}`,
    },
    body: fileBuffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok file upload failed (${res.status}): ${text}`);
  }
}

// ─── Poll Publish Status ─────────────────────────────────────────────────────

async function pollPublishStatus(
  accessToken: string,
  publishId: string,
  maxAttempts = 15,
  intervalMs = 5000,
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(
      'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publish_id: publishId }),
      },
    );

    if (!res.ok) continue; // Transient error, retry

    const body = (await res.json()) as TikTokPublishStatusResponse;
    const status = body.data?.status;

    if (status === 'PUBLISH_COMPLETE') {
      const postId = body.data.publicaly_available_post_id?.[0];
      return postId || null;
    }

    if (status === 'FAILED') {
      throw new Error(`TikTok publish failed: ${body.data.fail_reason || 'unknown'}`);
    }

    console.log(`  ⏳ [TikTok] Publish status: ${status} (attempt ${i + 1}/${maxAttempts})`);
  }

  console.warn('[TikTok] Publish status polling timed out.');
  return null;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Upload a video to TikTok using the Content Posting API v2 FILE_UPLOAD flow.
 *
 * @returns TikTok video URL on success, or a placeholder error string.
 */
export async function uploadToTikTok(
  projectId: string,
  videoPath: string,
  title: string,
  tags: string[],
  toolUrl?: string,
  toolName?: string,
): Promise<string> {
  console.log(`🎵 [TikTok] Starting upload for project: ${projectId}`);

  // ── Credential check ─────────────────────────────────────────────────────
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;

  if (!clientKey || !clientSecret || !refreshToken) {
    console.log('⏭️ [TikTok] Missing TIKTOK_CLIENT_KEY / SECRET / REFRESH_TOKEN — skipping.');
    return '';
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error(`File video không tồn tại: ${videoPath}`);
  }

  const videoSizeBytes = fs.statSync(videoPath).size;
  const maxSize = 50 * 1024 * 1024; // 50 MB
  if (videoSizeBytes > maxSize) {
    console.warn(`⚠️ [TikTok] Video too large (${(videoSizeBytes / 1024 / 1024).toFixed(1)} MB > 50 MB). Skipping.`);
    return '';
  }

  // Build TikTok title with hashtags (150 char max)
  const hashTags = tags.slice(0, 5).map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  const tiktokTitle = `${title} ${hashTags}`.slice(0, 150);

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 [TikTok] Upload attempt ${attempt}/${maxRetries}...`);

      // Step 1 — Refresh access token
      const { accessToken } = await refreshAccessToken(clientKey, clientSecret, refreshToken);

      // Step 2 — Init upload
      const { publishId, uploadUrl } = await initVideoUpload(accessToken, videoSizeBytes, tiktokTitle);
      console.log(`  📋 [TikTok] Publish ID: ${publishId}`);

      // Step 3 — Upload file
      await uploadVideoFile(uploadUrl, videoPath, videoSizeBytes);
      console.log('  ✅ [TikTok] File uploaded successfully.');

      // Step 4 — Poll for publish completion
      const postId = await pollPublishStatus(accessToken, publishId);

      if (postId) {
        const tiktokUrl = `https://www.tiktok.com/@techhustlelabs/video/${postId}`;
        console.log(`🎉 [TikTok] Published! URL: ${tiktokUrl}`);
        return tiktokUrl;
      }

      // Published but couldn't get postId — return generic success
      console.log('🎉 [TikTok] Upload completed (postId unavailable).');
      return 'https://www.tiktok.com/@techhustlelabs';

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ [TikTok] Error (attempt ${attempt}/${maxRetries}): ${msg}`);

      // PERMANENT ERRORS: Don't retry — these won't fix themselves
      const permanentErrors = [
        'unaudited_client_can_only_post_to_private_accounts',
        'scope_not_authorized',
        'invalid_client',
        'access_token_invalid',
        'token_expired',
      ];
      const isPermanent = permanentErrors.some(code => msg.includes(code));

      if (isPermanent) {
        if (msg.includes('unaudited_client')) {
          console.error('⚠️ [TikTok] App chưa qua audit! Submit "Content Posting API" review tại:');
          console.error('   → https://developers.tiktok.com → App review → Content Posting API');
          console.error('   → Until approved, uploads are restricted to private accounts only.');
        }
        console.error(`⛔ [TikTok] Permanent error — skipping (no retry).`);
        return '';
      }

      if (attempt < maxRetries) {
        const waitMs = attempt * 5000;
        console.log(`  ⏳ Retry in ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  console.error(`❌ [TikTok] All ${maxRetries} attempts failed.`);
  return '';
}
