/**
 * Facebook Publishing Test Script
 *
 * Usage:
 *   npx tsx src/scripts/test-fb-publish.ts --type=reel --video=path/to/video.mp4
 *   npx tsx src/scripts/test-fb-publish.ts --type=post --video=path/to/video.mp4
 *   npx tsx src/scripts/test-fb-publish.ts --type=both --video=path/to/video.mp4
 */
import 'dotenv/config';
import * as fs from 'fs';
import {
  publishFacebookReel,
  publishFacebookPost,
  buildReelCaption,
  buildPostDescription,
  isFacebookConfigured,
} from '../agents/agent-4-publisher/facebook-publisher';

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  FACEBOOK PUBLISHING TEST');
  console.log('═══════════════════════════════════════════════════\n');

  if (!isFacebookConfigured()) {
    console.error('❌ Missing FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN in .env');
    process.exit(1);
  }

  // Parse args
  const args = process.argv.slice(2);
  const typeArg = args.find(a => a.startsWith('--type='))?.split('=')[1] || 'both';
  const videoArg = args.find(a => a.startsWith('--video='))?.split('=')[1];

  if (!videoArg) {
    // Find most recent video in output
    const outputDir = 'output';
    if (fs.existsSync(outputDir)) {
      const dirs = fs.readdirSync(outputDir)
        .filter(d => fs.statSync(`${outputDir}/${d}`).isDirectory())
        .sort()
        .reverse();

      for (const dir of dirs) {
        const finalVideo = `${outputDir}/${dir}/final-video.mp4`;
        if (fs.existsSync(finalVideo)) {
          console.log(`📹 Using most recent video: ${finalVideo}`);
          return runTest(finalVideo, typeArg);
        }
      }
    }
    console.error('❌ No video found. Pass --video=path/to/video.mp4');
    process.exit(1);
  }

  if (!fs.existsSync(videoArg)) {
    console.error(`❌ Video not found: ${videoArg}`);
    process.exit(1);
  }

  return runTest(videoArg, typeArg);
}

async function runTest(videoPath: string, type: string) {
  const toolName = 'ElevenLabs';
  const hook = '🔥 This AI voice generator will blow your mind — it sounds 100% human!';
  const affiliateUrl = 'https://vibeytb.vercel.app/go/elevenlabs';

  const review = [
    '🤖 ElevenLabs Review — The Best AI Voice Generator in 2026',
    '',
    'I\'ve tested dozens of AI voice tools and ElevenLabs is hands down the best.',
    '',
    '✅ Natural, human-like voices in 30+ languages',
    '✅ Clone your own voice in minutes',
    '✅ API for developers + simple web interface',
    '✅ Free tier available to try',
    '',
    'Whether you\'re a content creator, developer, or just curious — this tool is a game changer.',
  ].join('\n');

  const fileSize = fs.statSync(videoPath).size;
  console.log(`📂 Video: ${videoPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`🎯 Type: ${type}\n`);

  if (type === 'reel' || type === 'both') {
    console.log('── Testing Reel ────────────────────────────────────');
    const caption = buildReelCaption(toolName, hook, affiliateUrl);
    console.log(`📝 Caption:\n${caption}\n`);
    const reelResult = await publishFacebookReel(videoPath, caption);
    console.log('Result:', JSON.stringify(reelResult, null, 2));
  }

  if (type === 'post' || type === 'both') {
    console.log('\n── Testing Post ────────────────────────────────────');
    const description = buildPostDescription(toolName, review, affiliateUrl);
    console.log(`📝 Description:\n${description}\n`);
    const postResult = await publishFacebookPost(videoPath, `${toolName} — Best AI Voice Generator`, description);
    console.log('Result:', JSON.stringify(postResult, null, 2));
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);
