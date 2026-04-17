import { google, youtube_v3 } from 'googleapis';
import fs from 'fs';
import { CHANNEL_HANDLE } from '../../utils/branding';
import { supabase } from '../../lib/supabase/client';

/**
 * Build final YouTube description.
 * NOTE: The orchestrator already appends CTA footer, hashtags, and tool link
 * in the-orchestrator.ts (descParts). This function just passes through.
 * Previously this duplicated the footer causing doubled CTA blocks.
 */
function buildSEODescription(original: string, _toolName?: string, _toolUrl?: string): string {
  return original;
}

/**
 * Optimize tags with broad + specific keyword mix for YouTube SEO.
 */
function buildSEOTags(original: string[], toolName?: string): string[] {
  const broadTags = ['ai tools', 'ai tools 2026', 'free ai', 'tech', 'productivity', 'shorts'];
  const specificTags = toolName
    ? [`${toolName} review`, `${toolName} tutorial`, `${toolName} ai`]
    : [];

  // Combine: original + broad + specific, deduplicated, max 15
  const all = [...original, ...broadTags, ...specificTags];
  const unique = [...new Set(all.map(t => t.toLowerCase()))];
  return unique.slice(0, 15);
}

/**
 * Rotating pinned comment templates for engagement.
 * Each template should include a question hook to drive comments.
 */
const PINNED_COMMENT_TEMPLATES = [
  (toolName?: string, toolUrl?: string) => [
    toolName ? `🔗 Try ${toolName} here:` : '🔗 Try this tool:',
    toolUrl || 'Link in description!',
    '',
    '💬 What AI tool should I review next? Drop it in the comments! 👇',
    `👉 Follow ${CHANNEL_HANDLE} for daily AI tool reviews!`,
  ].join('\n'),

  (toolName?: string, toolUrl?: string) => [
    toolName ? `🚀 ${toolName} is a game-changer!` : '🚀 This tool is a game-changer!',
    toolUrl ? `👉 ${toolUrl}` : '',
    '',
    '🤔 Have you tried this one yet? Let me know your thoughts! 👇',
    `🔔 Follow ${CHANNEL_HANDLE} + turn on notifications!`,
  ].join('\n'),

  (toolName?: string, toolUrl?: string) => [
    toolName ? `⚡ ${toolName} just blew my mind.` : '⚡ This AI just blew my mind.',
    toolUrl ? `Try it free: ${toolUrl}` : 'Link in description!',
    '',
    '📌 Which AI tool saves YOU the most time? Comment below! 👇',
    `👉 Follow ${CHANNEL_HANDLE} for daily discoveries!`,
  ].join('\n'),

  (toolName?: string, toolUrl?: string) => [
    toolName ? `🔥 ${toolName} is going viral for a reason.` : '🔥 This tool is going viral.',
    toolUrl ? `Check it out: ${toolUrl}` : 'Link below!',
    '',
    '💡 Comment "YES" if you want more AI tools like this!',
    `🔔 Follow ${CHANNEL_HANDLE} — new AI tool every day!`,
  ].join('\n'),
];

/**
 * Post a pinned comment on the uploaded video with rotating engagement templates.
 * Best-effort: failures are logged but don't affect the upload result.
 */
async function postPinnedComment(
  youtube: youtube_v3.Youtube,
  videoId: string,
  toolUrl?: string,
  toolName?: string,
): Promise<void> {
  // Pick template based on day to ensure variety
  const templateIndex = new Date().getDate() % PINNED_COMMENT_TEMPLATES.length;
  const commentText = PINNED_COMMENT_TEMPLATES[templateIndex](toolName, toolUrl);

  try {
    await youtube.commentThreads.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: { textOriginal: commentText },
          },
        },
      },
    });
    console.log(`💬 [Pinned Comment] Posted template #${templateIndex + 1} on video ${videoId}`);
  } catch (err: unknown) {
    // Common cause: OAuth token missing youtube.force-ssl scope
    // Fix: regenerate refresh token with scopes:
    //   youtube.upload + youtube.force-ssl
    const msg = err instanceof Error ? err.message : String(err);
    const statusCode = (err as Record<string, unknown>)?.code ||
                       (err as Record<string, unknown>)?.status || 'unknown';
    console.warn(`⚠️ [Pinned Comment] Failed (non-fatal) [HTTP ${statusCode}]: ${msg}`);
    if (msg.includes('insufficient authentication scopes')) {
      console.warn('💡 [Pinned Comment] FIX: Regenerate OAuth refresh token with scope: https://www.googleapis.com/auth/youtube.force-ssl');
    }
  }
}
/**
 * Upload SRT captions to YouTube to replace auto-generated captions.
 * Auto-CC adds [music] tags when it detects background music — our own captions prevent this.
 * Best-effort: failures are logged but don't affect the upload result.
 */
async function uploadCaptions(
  youtube: youtube_v3.Youtube,
  videoId: string,
  srtPath?: string,
): Promise<void> {
  if (!srtPath || !fs.existsSync(srtPath)) {
    console.log('[Captions] No SRT file available — skipping caption upload.');
    return;
  }

  try {
    await youtube.captions.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          videoId,
          language: 'en',
          name: 'English',
          isDraft: false,
        },
      },
      media: {
        mimeType: 'application/x-subrip',
        body: fs.createReadStream(srtPath),
      },
    });
    console.log(`📝 [Captions] SRT uploaded for ${videoId} — auto-CC will be replaced.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const statusCode = (err as Record<string, unknown>)?.code ||
                       (err as Record<string, unknown>)?.status || 'unknown';
    console.warn(`⚠️ [Captions] Failed (non-fatal) [HTTP ${statusCode}]: ${msg}`);
  }
}

/**
 * Upload Video lên YouTube sử dụng YouTube Data API v3
 * @returns {string} Trả về đường link video YouTube dạng https://youtu.be/...
 */
export async function uploadToYouTube(
  projectId: string,
  videoPath: string,
  title: string,
  description: string,
  tags: string[],
  isHeadless: boolean = true,
  toolUrl?: string,
  toolName?: string,
  toolTagline?: string,
  srtPath?: string,
): Promise<string> {
  console.log(`🚀 [API Uploader] Bắt đầu quá trình publish cho project: ${projectId}`);
  
  if (!fs.existsSync(videoPath)) {
    throw new Error(`File video không tồn tại: ${videoPath}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Thiếu cấu hình Google OAuth2 credentials (.env)');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client
  });

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📤 Đang upload file MP4 lên YouTube API v3 (Attempt ${attempt}/${maxRetries})... -> ${videoPath}`);

      const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description: buildSEODescription(description, toolName, toolUrl),
            tags: buildSEOTags(tags, toolName),
            categoryId: '28', // Science & Technology
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(videoPath),
        },
      });

      const videoId = res.data.id;
      if (!videoId) {
          throw new Error('Upload thành công nhưng không lấy được videoId.');
      }
      
      const videoUrl = `https://youtu.be/${videoId}`;
      console.log(`🎉 [SUCCESS] Upload hoàn tất. Video URL: ${videoUrl}`);

      // Upload custom thumbnail (best-effort)
      try {
        if (toolName) {
          const { generateThumbnail } = await import('./thumbnail-generator.js');
          const { thumbnailPath, thumbnailStyle } = await generateThumbnail(videoPath, toolName, projectId, toolTagline);
          await youtube.thumbnails.set({
            videoId,
            media: { body: fs.createReadStream(thumbnailPath) },
          });
          console.log(`🖼️ [Thumbnail] Custom thumbnail uploaded for ${videoId} (style: ${thumbnailStyle})`);
          // Save thumbnail_style to DB (best-effort)
          try {
            await supabase.from('video_projects').update({ thumbnail_style: thumbnailStyle }).eq('id', projectId);
          } catch { /* non-fatal */ }
        }
      } catch (thumbErr) {
        const msg = thumbErr instanceof Error ? thumbErr.message : String(thumbErr);
        console.warn(`⚠️ [Thumbnail] Failed (non-fatal): ${msg}`);
      }

      // Post pinned comment (best-effort, non-blocking for return)
      await postPinnedComment(youtube, videoId, toolUrl, toolName);

      // SRT upload DISABLED — ASS subtitles are already baked into the video pixels.
      // Uploading SRT creates a 2nd caption track → dual subtitle display bug.
      // If ASS baking is ever removed, re-enable this:
      // await uploadCaptions(youtube, videoId, srtPath);

      return videoUrl;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ [YouTube Upload] Lỗi (Attempt ${attempt}/${maxRetries}): ${errorMessage}`);

      // PERMANENT ERRORS: OAuth token expired/revoked — retrying is wasteful
      const permanentErrors = ['invalid_grant', 'invalid_client', 'unauthorized_client'];
      if (permanentErrors.some(code => errorMessage.includes(code))) {
        console.error('⛔ [YouTube] OAuth token expired or revoked.');
        console.error('💡 FIX: Regenerate token with: npx tsx src/scripts/get-youtube-token.ts');
        console.error('   Then update GOOGLE_REFRESH_TOKEN in .env + GitHub Secrets.');
        throw new Error(`YouTube OAuth error (permanent): ${errorMessage}`);
      }
      
      if (attempt < maxRetries) {
        const waitTime = attempt * 5000; // 5s, 10s
        console.log(`⏳ Retry sau ${waitTime / 1000}s...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }

  console.error(`❌ [YouTube Upload] Đã thử ${maxRetries} lần đều thất bại.`);
  throw new Error(`YouTube upload failed after ${maxRetries} attempts`);
}

