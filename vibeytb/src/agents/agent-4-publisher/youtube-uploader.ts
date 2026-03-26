import { google, youtube_v3 } from 'googleapis';
import fs from 'fs';

/**
 * Post a pinned comment on the uploaded video with CTA + tool link.
 * Best-effort: failures are logged but don't affect the upload result.
 */
async function postPinnedComment(
  youtube: youtube_v3.Youtube,
  videoId: string,
  toolUrl?: string,
  toolName?: string,
): Promise<void> {
  const commentText = [
    toolName ? `🔗 Try ${toolName} here:` : '🔗 Try this tool:',
    toolUrl || 'Link in description!',
    '',
    '👉 Follow @TechHustleLabs for daily AI tool reviews!',
    '🔔 Turn on notifications to never miss a new discovery!',
  ].join('\n');

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
    console.log(`💬 [Pinned Comment] Posted successfully on video ${videoId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ [Pinned Comment] Failed (non-fatal): ${msg}`);
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
  isHeadless: boolean = true, // Vẫn giữ nguyên signature
  toolUrl?: string,
  toolName?: string,
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
            description,
            tags,
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

      // Post pinned comment (best-effort, non-blocking for return)
      await postPinnedComment(youtube, videoId, toolUrl, toolName);

      return videoUrl;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ [YouTube Upload] Lỗi (Attempt ${attempt}/${maxRetries}): ${errorMessage}`);
      
      if (attempt < maxRetries) {
        const waitTime = attempt * 5000; // 5s, 10s
        console.log(`⏳ Retry sau ${waitTime / 1000}s...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }

  console.error(`❌ [YouTube Upload] Đã thử ${maxRetries} lần đều thất bại.`);
  return `https://youtu.be/error_${projectId}`;
}

