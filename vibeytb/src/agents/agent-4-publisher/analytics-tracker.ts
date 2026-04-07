import 'dotenv/config';
import { google } from 'googleapis';
import { supabase } from '../../lib/supabase/client';
import { notifyDiscord } from '../../utils/notifier';

/**
 * YouTube Analytics Tracker — Multi-snapshot performance tracking.
 *
 * Runs daily BEFORE the pipeline (GitHub Actions step).
 * Fetches views/likes/comments from YouTube Data API v3.
 *
 * Two-layer tracking:
 *   - views_24h / likes_24h / comments_24h: First snapshot only (historical reference)
 *   - views_latest / likes_latest / comments_latest: Updated EVERY run (real-time)
 *
 * Requires OAuth scope: youtube.readonly
 * $0 cost — YouTube Data API quota is generous for reads.
 */

interface VideoStats {
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

/**
 * Validate a YouTube URL is real (not an error_ placeholder).
 */
function isValidYoutubeUrl(url: string | null): boolean {
  if (!url) return false;
  // Reject error_ placeholder URLs from old upload bug
  if (url.includes('error_')) return false;
  // Must be a real YouTube URL
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

/**
 * Extract YouTube video ID from URL.
 */
function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match?.[1] || null;
}

/**
 * Fetch video statistics from YouTube Data API.
 * Requires youtube.readonly scope.
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ANALYTICS] YouTube API error for ${videoId}:`, msg);
    return null;
  }
}

/**
 * Main: Multi-snapshot analytics tracker.
 *
 * Logic:
 * 1. Fetch ALL published videos with valid YouTube URLs
 * 2. Skip videos with error_ placeholder URLs
 * 3. For each video:
 *    - If views_24h is NULL → set views_24h (first snapshot)
 *    - Always update views_latest (current snapshot)
 * 4. Send Discord summary with growth metrics
 */
export async function runAnalyticsTracker(): Promise<void> {
  console.log('[ANALYTICS] Starting YouTube Analytics Tracker (multi-snapshot)...');

  // Debug info
  const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon';
  console.log(`[ANALYTICS] Supabase key type: ${keyType}`);

  // Step 1: Fetch ALL published videos with YouTube URLs
  const { data: videos, error } = await supabase
    .from('video_projects')
    .select('id, youtube_url, tool_name, youtube_title, views_24h, views_latest')
    .eq('status', 'published')
    .not('youtube_url', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[ANALYTICS] Supabase query error:', error.message);
    return;
  }

  if (!videos || videos.length === 0) {
    console.log('[ANALYTICS] No published videos found.');
    return;
  }

  // Step 2: Filter valid URLs (skip error_ placeholders)
  const validVideos = videos.filter(v => isValidYoutubeUrl(v.youtube_url));
  const skippedCount = videos.length - validVideos.length;

  if (skippedCount > 0) {
    console.log(`[ANALYTICS] ⚠️ Skipped ${skippedCount} videos with invalid/error URLs`);
  }

  console.log(`[ANALYTICS] Tracking ${validVideos.length} valid videos...`);

  const results: Array<{
    title: string;
    views: number;
    likes: number;
    comments: number;
    previousViews: number | null;
    growth: string;
  }> = [];

  for (const video of validVideos) {
    const videoId = extractVideoId(video.youtube_url!);
    if (!videoId) {
      console.warn(`[ANALYTICS] Could not extract video ID from: ${video.youtube_url}`);
      continue;
    }

    const displayName = video.tool_name || video.youtube_title || 'Unknown';
    console.log(`[ANALYTICS] Fetching stats for "${displayName}" (${videoId})...`);

    const stats = await fetchVideoStats(videoId);
    if (!stats) continue;

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      // Always update "latest" snapshot
      views_latest: stats.viewCount,
      likes_latest: stats.likeCount,
      comments_latest: stats.commentCount,
      analytics_updated_at: new Date().toISOString(),
    };

    // Set 24h snapshot only on first track (historical reference)
    if (video.views_24h == null) {
      updatePayload.views_24h = stats.viewCount;
      updatePayload.likes_24h = stats.likeCount;
      updatePayload.comments_24h = stats.commentCount;
    }

    const { error: updateError } = await supabase
      .from('video_projects')
      .update(updatePayload)
      .eq('id', video.id);

    if (updateError) {
      console.warn(`[ANALYTICS] Failed to update ${video.id}:`, updateError.message);
    } else {
      // Calculate growth
      const previousViews = video.views_latest ?? video.views_24h;
      const growthFactor = previousViews && previousViews > 0
        ? `+${stats.viewCount - previousViews} (${((stats.viewCount / previousViews - 1) * 100).toFixed(0)}%)`
        : 'new';

      console.log(`[ANALYTICS] ✅ ${displayName}: ${stats.viewCount} views, ${stats.likeCount} likes, ${stats.commentCount} comments [${growthFactor}]`);

      results.push({
        title: displayName,
        views: stats.viewCount,
        likes: stats.likeCount,
        comments: stats.commentCount,
        previousViews: previousViews ?? null,
        growth: growthFactor,
      });
    }

    // Rate limit: 1 request per second
    await new Promise(r => setTimeout(r, 1000));
  }

  // Send Discord summary with growth metrics
  if (results.length > 0) {
    const totalViews = results.reduce((s, r) => s + r.views, 0);
    const totalLikes = results.reduce((s, r) => s + r.likes, 0);
    const avgLikeRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(1) : '0';

    const topVideos = [...results].sort((a, b) => b.views - a.views).slice(0, 5);
    const videoLines = topVideos
      .map((r, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} **${r.title}**: ${r.views} views [${r.growth}]`)
      .join('\n');

    await notifyDiscord({
      status: 'success',
      jobId: 'analytics',
      title: `📈 Analytics Report (${results.length} videos)`,
      toolName: `📊 Total: ${totalViews} views, ${totalLikes} likes (${avgLikeRate}% like rate)\n\n🏆 Top Videos:\n${videoLines}`,
    });
  } else {
    console.log('[ANALYTICS] No videos successfully tracked.');
  }

  console.log(`[ANALYTICS] Done. Tracked ${results.length}/${validVideos.length} videos.`);
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
