import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

/**
 * Backfill missing tool_name and youtube_title for published videos.
 * 1. Fetches snippet.title from YouTube Data API
 * 2. Extracts tool name from title using heuristics
 * 3. Updates Supabase
 * 4. Marks error_ URLs as failed
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match?.[1] || null;
}

/**
 * Extract tool name from YouTube title.
 * Common patterns:
 *   "This AI Tool Does X — It's Called ToolName"
 *   "ToolName: The AI That Does X"
 *   "Stop Using X. ToolName Is Better."
 */
function extractToolName(title: string): string | null {
  // Pattern: "It's called ToolName" or "called ToolName"
  const calledMatch = title.match(/(?:called|meet|introducing)\s+([A-Z][a-zA-Z0-9.]+)/i);
  if (calledMatch) return calledMatch[1];

  // Pattern: "ToolName: ..." or "ToolName —" or "ToolName |"
  const colonMatch = title.match(/^([A-Z][a-zA-Z0-9.]+)\s*[:|—–\-|]/);
  if (colonMatch) return colonMatch[1];

  // Pattern: first capitalized word that looks like a product name
  const words = title.split(/\s+/);
  for (const word of words) {
    // Skip common English words, look for product-like names
    if (/^[A-Z][a-z]+[A-Z]/.test(word)) return word; // camelCase like HeyGen
    if (/^[A-Z][a-z]+\.[a-z]+/.test(word)) return word; // Bolt.new
  }

  return null;
}

async function main() {
  console.log('=== BACKFILL METADATA ===\n');

  // Step 1: Mark error URLs as failed
  console.log('Step 1: Marking error URLs as failed...');
  const { data: errorVideos } = await supabase
    .from('video_projects')
    .select('id, youtube_url')
    .eq('status', 'published')
    .like('youtube_url', '%error_%');

  if (errorVideos && errorVideos.length > 0) {
    for (const v of errorVideos) {
      const { error } = await supabase
        .from('video_projects')
        .update({ status: 'failed', youtube_url: null })
        .eq('id', v.id);
      if (error) {
        console.log(`  ❌ Failed to update ${v.id}: ${error.message}`);
      } else {
        console.log(`  ✅ Marked ${v.id} as failed (was: ${v.youtube_url?.slice(0, 50)})`);
      }
    }
  } else {
    console.log('  No error URLs found.');
  }

  // Step 2: Find videos with NULL tool_name
  console.log('\nStep 2: Backfilling tool_name from YouTube...');
  const { data: nullVideos } = await supabase
    .from('video_projects')
    .select('id, youtube_url, tool_name, youtube_title')
    .eq('status', 'published')
    .is('tool_name', null)
    .not('youtube_url', 'is', null);

  if (!nullVideos || nullVideos.length === 0) {
    console.log('  No videos need backfill.');
    process.exit(0);
  }

  console.log(`  Found ${nullVideos.length} videos to backfill.\n`);

  // Setup YouTube API
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  // Batch fetch video titles (max 50 per API call)
  const videoIds = nullVideos
    .map(v => extractVideoId(v.youtube_url!))
    .filter(Boolean) as string[];

  const response = await youtube.videos.list({
    part: ['snippet'],
    id: videoIds,
  });

  const titleMap = new Map<string, string>();
  for (const item of response.data.items ?? []) {
    if (item.id && item.snippet?.title) {
      titleMap.set(item.id, item.snippet.title);
    }
  }

  console.log(`  YouTube returned titles for ${titleMap.size}/${videoIds.length} videos.\n`);

  // Update each video
  let updated = 0;
  for (const v of nullVideos) {
    const videoId = extractVideoId(v.youtube_url!);
    if (!videoId) continue;

    const ytTitle = titleMap.get(videoId);
    if (!ytTitle) {
      console.log(`  ⚠️  ${v.id.slice(0, 8)}: No title from YouTube (deleted?)`);
      continue;
    }

    const toolName = extractToolName(ytTitle);
    const updatePayload: Record<string, unknown> = {
      youtube_title: ytTitle,
    };
    if (toolName) {
      updatePayload.tool_name = toolName;
    }

    const { error } = await supabase
      .from('video_projects')
      .update(updatePayload)
      .eq('id', v.id);

    if (error) {
      console.log(`  ❌ ${v.id.slice(0, 8)}: Update failed: ${error.message}`);
    } else {
      console.log(`  ✅ ${v.id.slice(0, 8)}: "${ytTitle}" → tool: ${toolName ?? 'MANUAL_NEEDED'}`);
      updated++;
    }
  }

  console.log(`\n=== DONE: ${updated}/${nullVideos.length} videos updated ===`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
