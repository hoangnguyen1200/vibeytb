import 'dotenv/config';
import { google } from 'googleapis';
import { supabase } from '../../lib/supabase/client';
import { notifyDiscord } from '../../utils/notifier';

/**
 * YouTube Analytics Tracker — fetches video performance stats 24h after upload.
 * Uses YouTube Data API v3 (free, same OAuth as uploader).
 * Stores views_24h, likes_24h, comments_24h back to Supabase.
 * $0 cost — YouTube Data API quota is generous for reads.
 */

interface VideoStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

/**
 * Fetch video statistics from YouTube Data API.
 */
async function fetchVideoStats(videoId: string): Promise<VideoStats | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[ANALYTICS] Missing Google OAuth credentials. Skipping.');
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  try {
    const response = await youtube.videos.list({
      part: ['statistics'],
      id: [videoId],
    });

    const stats = response.data.items?.[0]?.statistics;
    if (!stats) {
      console.warn(`[ANALYTICS] No stats found for video ${videoId}`);
      return null;
    }

    return {
      viewCount: parseInt(stats.viewCount || '0', 10),
      likeCount: parseInt(stats.likeCount || '0', 10),
      commentCount: parseInt(stats.commentCount || '0', 10),
    };
  } catch (err) {
    console.error('[ANALYTICS] YouTube API error:', err);
    return null;
  }
}

/**
 * Extract YouTube video ID from URL.
 */
function extractVideoId(url: string): string | null {
  // Handle youtu.be/ID and youtube.com/watch?v=ID and youtube.com/shorts/ID
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match?.[1] || null;
}

/**
 * Main: Fetch stats for recently published videos (24-48h old).
 * Updates Supabase with analytics data and sends Discord summary.
 */
export async function runAnalyticsTracker(): Promise<void> {
  console.log('[ANALYTICS] Starting YouTube Analytics Tracker...');

  // Find videos published 24-48h ago that haven't been tracked yet
  const now = new Date();
  const ago48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: videos, error } = await supabase
    .from('video_projects')
    .select('id, youtube_url, tool_name, youtube_title, views_24h')
    .eq('status', 'published')
    .not('youtube_url', 'is', null)
    .gte('updated_at', ago48h)
    .lte('updated_at', ago24h);

  if (error) {
    console.error('[ANALYTICS] Supabase query error:', error.message);
    return;
  }

  if (!videos || videos.length === 0) {
    console.log('[ANALYTICS] No videos to track (none published 24-48h ago).');
    return;
  }

  console.log(`[ANALYTICS] Found ${videos.length} videos to track.`);

  const results: Array<{ title: string; views: number; likes: number; comments: number }> = [];

  for (const video of videos) {
    // Skip already tracked
    if (video.views_24h !== null && video.views_24h !== undefined) {
      console.log(`[ANALYTICS] Skipping "${video.tool_name}" — already tracked.`);
      continue;
    }

    const videoId = extractVideoId(video.youtube_url);
    if (!videoId) {
      console.warn(`[ANALYTICS] Could not extract video ID from: ${video.youtube_url}`);
      continue;
    }

    console.log(`[ANALYTICS] Fetching stats for "${video.tool_name}" (${videoId})...`);
    const stats = await fetchVideoStats(videoId);
    if (!stats) continue;

    // Update Supabase
    const { error: updateError } = await supabase
      .from('video_projects')
      .update({
        views_24h: stats.viewCount,
        likes_24h: stats.likeCount,
        comments_24h: stats.commentCount,
      })
      .eq('id', video.id);

    if (updateError) {
      console.warn(`[ANALYTICS] Failed to update ${video.id}:`, updateError.message);
    } else {
      console.log(`[ANALYTICS] ✅ ${video.tool_name}: ${stats.viewCount} views, ${stats.likeCount} likes, ${stats.commentCount} comments`);
      results.push({
        title: video.youtube_title || video.tool_name || 'Unknown',
        views: stats.viewCount,
        likes: stats.likeCount,
        comments: stats.commentCount,
      });
    }

    // Rate limit: 1 request per second
    await new Promise(r => setTimeout(r, 1000));
  }

  // Send Discord summary
  if (results.length > 0) {
    const summary = results
      .map(r => `📊 **${r.title}**: ${r.views} views, ${r.likes} likes, ${r.comments} comments`)
      .join('\n');

    await notifyDiscord({
      status: 'success',
      jobId: 'analytics',
      title: `📈 24h Performance Report (${results.length} videos)`,
      toolName: summary,
    });
  }

  console.log(`[ANALYTICS] Done. Tracked ${results.length} videos.`);
}

// Direct execution
if (process.argv[1]?.includes('analytics-tracker')) {
  runAnalyticsTracker()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[ANALYTICS] Fatal error:', err);
      process.exit(1);
    });
}
