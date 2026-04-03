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

  // Debug: check which key is being used
  const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon';
  console.log(`[ANALYTICS] Supabase key type: ${keyType}`);
  console.log(`[ANALYTICS] Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30)}...`);

  // Step 1: Check total published count (debug)
  const { count: totalPublished } = await supabase
    .from('video_projects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published');
  console.log(`[ANALYTICS] Total published videos in DB: ${totalPublished ?? 'null (RLS blocked?)'}`);

  // Find ALL published videos that haven't been tracked yet
  const { data: videos, error } = await supabase
    .from('video_projects')
    .select('id, youtube_url, tool_name, youtube_title, views_24h')
    .eq('status', 'published')
    .not('youtube_url', 'is', null)
    .is('views_24h', null)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[ANALYTICS] Supabase query error:', error.message);
    return;
  }

  console.log(`[ANALYTICS] Trackable videos found: ${videos?.length ?? 0}`);

  if (!videos || videos.length === 0) {
    console.log('[ANALYTICS] No videos to track. Possible causes:');
    console.log('  - All published videos already have views_24h data');
    console.log('  - RLS is blocking the query (check SUPABASE_SERVICE_ROLE_KEY)');
    console.log('  - No videos have youtube_url set');
    return;
  }

  console.log(`[ANALYTICS] Found ${videos.length} videos to track.`);

  const results: Array<{ title: string; views: number; likes: number; comments: number }> = [];

  for (const video of videos) {

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
