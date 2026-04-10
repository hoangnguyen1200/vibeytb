/**
 * Retroactive Description Updater
 * Updates YouTube video descriptions to include affiliate links.
 * 
 * Usage: npx tsx src/scripts/update-affiliate-descriptions.ts
 */
import 'dotenv/config';
import { google } from 'googleapis';
import { resolveAffiliateUrl, AFFILIATE_REGISTRY } from '../utils/affiliate-registry';
import { AFFILIATE_DISCLOSURE, TOOLS_PAGE_URL, CHANNEL_HANDLE } from '../utils/branding';

// Videos to update — tool name + YouTube video ID
const VIDEOS_TO_UPDATE = [
  {
    videoId: 'ojLhmID2UC8',
    toolName: 'ElevenLabs',
    directUrl: 'https://elevenlabs.io',
  },
  // HeyGen — uncomment when affiliate is approved
  // {
  //   videoId: 'Yt0ldi7c_wo',
  //   toolName: 'HeyGen',
  //   directUrl: 'https://heygen.com',
  // },
];

async function getYouTubeClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in .env');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.youtube({ version: 'v3', auth: oauth2Client });
}

async function updateVideoDescription(
  youtube: ReturnType<typeof google.youtube>,
  videoId: string,
  toolName: string,
  directUrl: string,
) {
  console.log(`\n📹 Processing: ${toolName} (${videoId})`);

  // 1. Fetch current video details
  const { data } = await youtube.videos.list({
    part: ['snippet'],
    id: [videoId],
  });

  const video = data.items?.[0];
  if (!video?.snippet) {
    console.error(`  ❌ Video not found: ${videoId}`);
    return false;
  }

  const currentDesc = video.snippet.description || '';
  console.log(`  📝 Current description (${currentDesc.length} chars)`);

  // 2. Resolve affiliate URL
  const { url: affiliateUrl, isAffiliate } = resolveAffiliateUrl(toolName, directUrl);
  if (!isAffiliate) {
    console.log(`  ⏭ No active affiliate for ${toolName} — skipping`);
    return false;
  }
  console.log(`  💰 Affiliate URL: ${affiliateUrl}`);

  // 3. Replace direct URL with affiliate URL in description
  let newDesc = currentDesc;

  // Replace common URL patterns
  const urlPatterns = [
    // "🔗 Try it: https://elevenlabs.io"
    new RegExp(`(🔗 Try it: )${escapeRegex(directUrl)}[^\\s]*`, 'gi'),
    // "https://elevenlabs.io" standalone
    new RegExp(`(?<=\\s|^)${escapeRegex(directUrl)}[^\\s]*(?=\\s|$)`, 'gi'),
    // "Try it free: https://elevenlabs.io"
    new RegExp(`(Try it.*?: )${escapeRegex(directUrl)}[^\\s]*`, 'gi'),
    // "👉 https://elevenlabs.io"
    new RegExp(`(👉 )${escapeRegex(directUrl)}[^\\s]*`, 'gi'),
  ];

  let replaced = false;
  for (const pattern of urlPatterns) {
    if (pattern.test(newDesc)) {
      newDesc = newDesc.replace(pattern, `$1${affiliateUrl}`);
      replaced = true;
    }
  }

  // If no URL pattern matched, try simple domain replacement
  if (!replaced) {
    const domain = new URL(directUrl).hostname;
    const domainRegex = new RegExp(`https?://(?:www\\.)?${escapeRegex(domain)}[^\\s]*`, 'gi');
    if (domainRegex.test(newDesc)) {
      // Only replace the first occurrence in "Try it" context
      newDesc = newDesc.replace(domainRegex, affiliateUrl);
      replaced = true;
    }
  }

  // Add tools page link if not already present
  if (!newDesc.includes(TOOLS_PAGE_URL)) {
    newDesc += `\n🤖 All AI tools I recommend: ${TOOLS_PAGE_URL}`;
  }

  // Add disclosure if not already present
  if (!newDesc.includes('affiliate')) {
    newDesc += `\n\n📋 ${AFFILIATE_DISCLOSURE}`;
  }

  if (!replaced && !newDesc.includes(affiliateUrl)) {
    // No URL found to replace — add affiliate link at top
    newDesc = `🔗 Try ${toolName}: ${affiliateUrl}\n\n${newDesc}`;
    console.log(`  ⚠️ No existing URL found — added affiliate link at top`);
  }

  if (newDesc === currentDesc) {
    console.log(`  ✅ Description already up-to-date`);
    return true;
  }

  // 4. Update video description
  console.log(`  📤 Updating description...`);
  await youtube.videos.update({
    part: ['snippet'],
    requestBody: {
      id: videoId,
      snippet: {
        ...video.snippet,
        description: newDesc,
        categoryId: video.snippet.categoryId || '28', // Science & Technology
      },
    },
  });

  console.log(`  ✅ Description updated successfully!`);
  console.log(`  📊 ${currentDesc.length} → ${newDesc.length} chars`);
  return true;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update pinned comment with affiliate link + tools page
 */
async function updatePinnedComment(
  youtube: ReturnType<typeof google.youtube>,
  videoId: string,
  toolName: string,
  affiliateUrl: string,
) {
  console.log(`  💬 Updating pinned comment...`);

  const commentText = [
    `🔗 Try ${toolName} here: ${affiliateUrl}`,
    `🤖 All AI tools I recommend: ${TOOLS_PAGE_URL}`,
    '',
    `👉 Follow ${CHANNEL_HANDLE} for daily AI tool reviews!`,
    `📋 ${AFFILIATE_DISCLOSURE}`,
  ].join('\n');

  // List existing comments by channel to find pinned one
  const { data: threads } = await youtube.commentThreads.list({
    part: ['snippet'],
    videoId,
    order: 'relevance',
    maxResults: 5,
  });

  // Find comment by channel (our own comment)
  const ownComment = threads.items?.find(
    t => t.snippet?.topLevelComment?.snippet?.authorChannelId?.value
      && t.snippet?.isPublic !== false
  );

  if (ownComment?.snippet?.topLevelComment?.id) {
    // Update existing comment
    await youtube.comments.update({
      part: ['snippet'],
      requestBody: {
        id: ownComment.snippet.topLevelComment.id,
        snippet: {
          textOriginal: commentText,
        },
      },
    });
    console.log(`  ✅ Pinned comment updated`);
  } else {
    // Insert new comment
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
    console.log(`  ✅ New pinned comment created`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  AFFILIATE DESCRIPTION + COMMENT UPDATER');
  console.log('═══════════════════════════════════════════════════');

  // Show active affiliates
  const activeAffiliates = Object.entries(AFFILIATE_REGISTRY)
    .filter(([, e]) => e.active)
    .map(([, e]) => `${e.name} (${e.commission})`);
  console.log(`\n💰 Active affiliates: ${activeAffiliates.join(', ') || 'none'}`);
  console.log(`📹 Videos to update: ${VIDEOS_TO_UPDATE.length}`);

  const youtube = await getYouTubeClient();
  let success = 0;
  let failed = 0;

  for (const video of VIDEOS_TO_UPDATE) {
    try {
      const ok = await updateVideoDescription(youtube, video.videoId, video.toolName, video.directUrl);
      if (ok) {
        // Also update pinned comment
        const { url: affiliateUrl, isAffiliate } = resolveAffiliateUrl(video.toolName, video.directUrl);
        if (isAffiliate) {
          await updatePinnedComment(youtube, video.videoId, video.toolName, affiliateUrl);
        }
        success++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed: ${msg}`);
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  DONE: ${success} updated, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);
