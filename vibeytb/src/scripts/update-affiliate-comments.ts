/**
 * Update Affiliate Pinned Comments
 * Finds pinned comments with direct URLs and replaces with affiliate links.
 * 
 * Usage: npx tsx src/scripts/update-affiliate-comments.ts
 */
import 'dotenv/config';
import { google } from 'googleapis';
import { resolveAffiliateUrl } from '../utils/affiliate-registry';
import { CHANNEL_HANDLE } from '../utils/branding';

const VIDEOS_TO_UPDATE = [
  {
    videoId: 'ojLhmID2UC8',
    toolName: 'ElevenLabs',
    directUrl: 'https://elevenlabs.io',
  },
  // Add more videos here as needed
];

async function getYouTubeClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in .env');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

async function updateVideoComments(
  youtube: ReturnType<typeof google.youtube>,
  videoId: string,
  toolName: string,
  directUrl: string,
) {
  console.log(`\n📹 Processing comments for: ${toolName} (${videoId})`);

  // 1. Resolve affiliate URL
  const { url: affiliateUrl, isAffiliate } = resolveAffiliateUrl(toolName, directUrl);
  if (!isAffiliate) {
    console.log(`  ⏭ No active affiliate for ${toolName} — skipping`);
    return false;
  }
  console.log(`  💰 Affiliate URL: ${affiliateUrl}`);

  // 2. Fetch comment threads for this video (our channel's comments)
  const { data } = await youtube.commentThreads.list({
    part: ['snippet'],
    videoId,
    maxResults: 25,
    order: 'relevance',
  });

  const threads = data.items ?? [];
  console.log(`  📝 Found ${threads.length} comment threads`);

  let updated = 0;

  for (const thread of threads) {
    const comment = thread.snippet?.topLevelComment;
    const snippet = comment?.snippet;
    if (!snippet || !comment?.id) continue;

    // Only process our own comments (by channel handle match or author check)
    const authorUrl = snippet.authorChannelUrl || '';
    const isOurs = authorUrl.includes('TechHustleLabs') ||
                   snippet.authorDisplayName?.includes('TechHustleLabs') ||
                   snippet.authorDisplayName?.includes(CHANNEL_HANDLE.replace('@', ''));

    if (!isOurs) continue;

    const text = snippet.textOriginal || snippet.textDisplay || '';

    // Check if comment contains the direct URL (not already affiliate)
    const domain = new URL(directUrl).hostname;
    if (!text.includes(domain) || text.includes(affiliateUrl)) {
      if (text.includes(affiliateUrl)) {
        console.log(`  ✅ Comment ${comment.id} already has affiliate link`);
      }
      continue;
    }

    console.log(`  🔍 Found comment with direct URL: "${text.slice(0, 80)}..."`);

    // Replace direct URL with affiliate URL
    const newText = text.replace(
      new RegExp(`https?://(?:www\\.)?${escapeRegex(domain)}[^\\s]*`, 'gi'),
      affiliateUrl,
    );

    if (newText === text) continue;

    // 3. Update the comment
    try {
      await youtube.comments.update({
        part: ['snippet'],
        requestBody: {
          id: comment.id,
          snippet: {
            textOriginal: newText,
          },
        },
      });
      console.log(`  ✅ Updated comment ${comment.id}`);
      console.log(`     Before: ${text.slice(0, 100)}`);
      console.log(`     After:  ${newText.slice(0, 100)}`);
      updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed to update comment ${comment.id}: ${msg}`);
    }
  }

  if (updated === 0) {
    console.log(`  ⚠️ No comments found with direct URL to update`);
  }

  return updated > 0;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  AFFILIATE COMMENT UPDATER');
  console.log('═══════════════════════════════════════════════════');

  const youtube = await getYouTubeClient();
  let success = 0;

  for (const video of VIDEOS_TO_UPDATE) {
    try {
      const ok = await updateVideoComments(youtube, video.videoId, video.toolName, video.directUrl);
      if (ok) success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed: ${msg}`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  DONE: ${success} videos updated`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);
