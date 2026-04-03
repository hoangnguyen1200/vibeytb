import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { ffmpegPath } from '../../utils/ffmpeg';

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
 * Escape text for FFmpeg drawtext filter.
 * FFmpeg drawtext requires special escaping for: ' : \ and some special chars
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\\\:')
    .replace(/%/g, '%%');
}

/**
 * Generate a YouTube thumbnail (1280×720) from the final video.
 *
 * Uses raw FFmpeg command with simple -vf filtergraph (NOT complexFilter)
 * to avoid "Error reinitializing filters!" crash with fluent-ffmpeg on
 * portrait→landscape conversion.
 *
 * Features:
 *   - Frame extracted at ~4s (skip blank page load)
 *   - Scale + letterbox to 1280×720
 *   - Dark gradient bar at bottom
 *   - Tool name in large bold text
 *   - Badge (FREE/NEW/TRENDING) at top-right
 *   - Subtitle "AI Tool Review"
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

  const safeToolName = escapeDrawtext(toolName);
  const badge = pickBadge(tagline || '');
  const emoji = badgeEmoji(badge);
  const safeBadge = escapeDrawtext(`${emoji} ${badge}`);

  // Build -vf filtergraph chain (simple, not complex → avoids re-init crash)
  // Order: scale → drawbox (gradient) → drawbox (accent) → drawbox (badge bg) → drawtext × 3
  const filters = [
    // Scale to fill 1280×720, handle any input aspect ratio
    'scale=1280:720:force_original_aspect_ratio=increase',
    'crop=1280:720',
    // Dark vignette — top dim bar
    "drawbox=x=0:y=0:w=iw:h=80:color=black@0.5:t=fill",
    // Purple accent bar — top edge (brand identity)
    "drawbox=x=0:y=0:w=iw:h=5:color=#7C3AED@0.95:t=fill",
    // Dark gradient bar at bottom (180px)
    "drawbox=x=0:y=ih-180:w=iw:h=180:color=black@0.8:t=fill",
    // Purple accent line on gradient bar
    "drawbox=x=0:y=ih-180:w=iw:h=3:color=#7C3AED@0.9:t=fill",
    // Badge background — top-right corner (red)
    "drawbox=x=iw-220:y=15:w=200:h=50:color=#EF4444@0.9:t=fill",
    // Badge text
    `drawtext=text='${safeBadge}':fontcolor=white:fontsize=28:x=iw-200:y=24:font=Impact`,
    // Tool name — large bold text (centered in gradient)
    `drawtext=text='${safeToolName}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=h-155:font=Impact:borderw=2:bordercolor=black`,
    // Subtitle — "AI Tool Review"
    `drawtext=text='AI Tool Review':fontcolor=#A78BFA:fontsize=28:x=(w-text_w)/2:y=h-60:font=Impact`,
  ].join(',');

  // Normalize path for FFmpeg (forward slashes)
  const inputPath = videoPath.replace(/\\/g, '/');
  const outPath = outputPath.replace(/\\/g, '/');

  // Use full ffmpeg path from @ffmpeg-installer (bare 'ffmpeg' not in runner PATH)
  const safeFfmpegPath = ffmpegPath.replace(/\\/g, '/');
  const cmd = `"${safeFfmpegPath}" -y -ss 4 -i "${inputPath}" -frames:v 1 -vf "${filters}" -q:v 2 "${outPath}"`;

  try {
    execSync(cmd, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    console.log('[THUMBNAIL] Generated successfully');
    return outputPath;
  } catch (err) {
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString() || '';
    console.error('[THUMBNAIL] Generation failed:', stderr.slice(-200));
    throw new Error(`Thumbnail generation failed: ${stderr.slice(-100)}`);
  }
}
