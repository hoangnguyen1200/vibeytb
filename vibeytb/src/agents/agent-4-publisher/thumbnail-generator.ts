import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

/**
 * Determine the badge text based on the tool's tagline content.
 * Scans for keywords to pick the most relevant badge.
 */
function pickBadge(tagline: string): string {
  const lower = (tagline || '').toLowerCase();
  if (lower.includes('free') || lower.includes('open source') || lower.includes('no cost')) {
    return 'FREE';
  }
  if (lower.includes('launch') || lower.includes('new') || lower.includes('just released') || lower.includes('beta')) {
    return 'NEW';
  }
  if (lower.includes('trending') || lower.includes('viral') || lower.includes('popular') || lower.includes('hot')) {
    return 'TRENDING';
  }
  // Default: rotate based on day of week
  const badges = ['FREE', 'NEW', 'TRENDING'];
  return badges[new Date().getDay() % badges.length];
}

/**
 * Pick an emoji for the badge type.
 */
function badgeEmoji(badge: string): string {
  switch (badge) {
    case 'FREE': return '🆓';
    case 'NEW': return '🔥';
    case 'TRENDING': return '⚡';
    default: return '🔥';
  }
}

/**
 * Generate a YouTube thumbnail (1280×720) from the final video.
 * Features:
 *   - Frame extracted at ~2s
 *   - Gradient overlay (purple→black) at bottom
 *   - Tool name in large bold text + emoji
 *   - Subtitle "AI Tool Review"
 *   - Dynamic badge (FREE/NEW/TRENDING) at top-right corner
 */
export async function generateThumbnail(
  videoPath: string,
  toolName: string,
  jobId: string,
  tagline?: string,
): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', jobId);
  fs.mkdirSync(tmpDir, { recursive: true });
  const outputPath = path.join(tmpDir, 'thumbnail.jpg');

  // Skip if already generated (idempotent)
  if (fs.existsSync(outputPath)) {
    console.log('[THUMBNAIL] Using cached thumbnail');
    return outputPath;
  }

  console.log(`[THUMBNAIL] Generating thumbnail for "${toolName}"...`);

  // Sanitize tool name for FFmpeg drawtext (escape special chars)
  const safeToolName = toolName
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "\\\\\\'")
    .replace(/:/g, '\\\\:');

  const badge = pickBadge(tagline || '');
  const emoji = badgeEmoji(badge);
  const safeBadge = `${emoji} ${badge}`;

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(2)
      .frames(1)
      .complexFilter([
        // Scale to fill 1280x720 (handles any input aspect ratio including portrait)
        {
          filter: 'scale',
          options: '1280:720',
          inputs: '0:v',
          outputs: 'scaled',
        },
        // Gradient overlay — dark gradient bar at bottom (150px tall)
        {
          filter: 'drawbox',
          options: {
            x: 0,
            y: 'ih-150',
            w: 'iw',
            h: 150,
            color: 'black@0.75',
            t: 'fill',
          },
          inputs: 'scaled',
          outputs: 'bar1',
        },
        // Purple tint on the gradient bar (subtle brand color)
        {
          filter: 'drawbox',
          options: {
            x: 0,
            y: 'ih-150',
            w: 'iw',
            h: 4,
            color: '#7C3AED@0.9',
            t: 'fill',
          },
          inputs: 'bar1',
          outputs: 'bar2',
        },
        // Badge background — top-right corner
        {
          filter: 'drawbox',
          options: {
            x: 'iw-220',
            y: 15,
            w: 200,
            h: 50,
            color: '#EF4444@0.9',
            t: 'fill',
          },
          inputs: 'bar2',
          outputs: 'badge_bg',
        },
        // Badge text (FREE / NEW / TRENDING)
        {
          filter: 'drawtext',
          options: {
            text: safeBadge,
            fontcolor: 'white',
            fontsize: 28,
            x: 'iw-200',
            y: 24,
            font: 'Impact',
          },
          inputs: 'badge_bg',
          outputs: 'badged',
        },
        // Tool name — large bold text
        {
          filter: 'drawtext',
          options: {
            text: safeToolName,
            fontcolor: 'white',
            fontsize: 56,
            x: '(w-text_w)/2',
            y: 'h-130',
            font: 'Impact',
          },
          inputs: 'badged',
          outputs: 'titled',
        },
        // Subtitle — "AI Tool Review" in smaller text
        {
          filter: 'drawtext',
          options: {
            text: 'AI Tool Review',
            fontcolor: '#A78BFA',
            fontsize: 28,
            x: '(w-text_w)/2',
            y: 'h-60',
            font: 'Impact',
          },
          inputs: 'titled',
          outputs: 'out',
        },
      ])
      .outputOptions([
        '-map', '[out]',
        '-q:v', '2', // High quality JPEG
      ])
      .output(outputPath)
      .on('end', () => {
        console.log('[THUMBNAIL] Generated successfully');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('[THUMBNAIL] Generation failed:', err.message);
        reject(err);
      })
      .run();
  });
}
