import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { ffmpegPath } from '../../utils/ffmpeg';

/**
 * Detect a usable font for FFmpeg drawtext on the current OS.
 * Linux (GitHub Actions) doesn't have Impact — use system fallback.
 */
function detectFont(): string {
  // Linux system font paths (GitHub Actions Ubuntu runners)
  const linuxFonts = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/truetype/ubuntu/Ubuntu-Bold.ttf',
  ];

  for (const fontPath of linuxFonts) {
    if (fs.existsSync(fontPath)) {
      return fontPath;
    }
  }

  // Windows: Impact is available by name
  if (process.platform === 'win32') {
    return ''; // empty = use font= parameter instead of fontfile=
  }

  return ''; // fallback: let FFmpeg use its default
}

/**
 * Build the font parameter string for drawtext.
 * Uses fontfile= on Linux, font= on Windows.
 */
function fontParam(): string {
  const fontPath = detectFont();
  if (fontPath) {
    const escaped = fontPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
    return `fontfile='${escaped}'`;
  }
  // Windows fallback
  return 'font=Impact';
}

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
function badgeEmoji(_badge: string): string {
  // FFmpeg drawtext does NOT support Unicode emoji — causes
  // "Error reinitializing filters!" crash. Return empty string.
  return '';
}

/**
 * Escape text for FFmpeg drawtext filter.
 * FFmpeg drawtext requires special escaping for: ' : \ and some special chars
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, '') // Strip non-ASCII (emoji, CJK, etc.)
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\\\:')
    .replace(/%/g, '%%');
}

/**
 * Generate a YouTube thumbnail (1280×720) from the final video.
 *
 * Uses a 2-pass FFmpeg approach to avoid "Error reinitializing filters!"
 * crash when converting portrait (1080×1920) to landscape (1280×720)
 * with complex drawtext overlays in a single filtergraph.
 *
 * Pass 1: Extract frame → scale+crop to 1280×720 → temp PNG
 * Pass 2: Load landscape PNG → apply all overlays → final JPG
 *
 * Features:
 *   - Frame extracted at ~4s (skip blank page load)
 *   - Scale + crop to 1280×720
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

  // Normalize paths for FFmpeg (forward slashes)
  const inputPath = videoPath.replace(/\\/g, '/');
  const outPath = outputPath.replace(/\\/g, '/');
  const safeFfmpegPath = ffmpegPath.replace(/\\/g, '/');

  // --- PASS 1: Extract frame → scale+crop to clean 1280×720 PNG ---
  // This isolates the portrait→landscape conversion from the overlay filters,
  // avoiding the "Error reinitializing filters!" crash.
  const tempFramePath = path.join(tmpDir, 'thumb_frame.png').replace(/\\/g, '/');
  const pass1Cmd = [
    `"${safeFfmpegPath}"`,
    '-y -ss 4',
    `-i "${inputPath}"`,
    '-frames:v 1',
    '-vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720"',
    `"${tempFramePath}"`,
  ].join(' ');

  // --- PASS 2: Overlay graphics on clean landscape frame ---
  // Input is now a clean 1280×720 PNG — no resolution context switch.
  const font = fontParam();

  const overlayFilters = [
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
    `drawtext=text='${safeBadge}':fontcolor=white:fontsize=28:x=iw-200:y=24:${font}`,
    // Tool name — large bold text (centered in gradient)
    `drawtext=text='${safeToolName}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=h-155:${font}:borderw=2:bordercolor=black`,
    // Subtitle — "AI Tool Review"
    `drawtext=text='AI Tool Review':fontcolor=#A78BFA:fontsize=28:x=(w-text_w)/2:y=h-60:${font}`,
  ].join(',');

  const pass2Cmd = [
    `"${safeFfmpegPath}"`,
    '-y',
    `-i "${tempFramePath}"`,
    `-vf "${overlayFilters}"`,
    `-q:v 2`,
    `"${outPath}"`,
  ].join(' ');

  try {
    // Pass 1: Extract and scale frame
    execSync(pass1Cmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
    console.log('[THUMBNAIL] Pass 1: Frame extracted (1280×720)');

    // Pass 2: Apply overlays
    execSync(pass2Cmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
    console.log('[THUMBNAIL] Pass 2: Overlays applied');

    // Cleanup temp frame
    try { fs.unlinkSync(tempFramePath.replace(/\//g, path.sep)); } catch { /* ignore */ }

    console.log('[THUMBNAIL] Generated successfully');
    return outputPath;
  } catch (err) {
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString() || '';
    console.error('[THUMBNAIL] Generation failed:', stderr.slice(-200));
    // Cleanup temp frame on error
    try { fs.unlinkSync(tempFramePath.replace(/\//g, path.sep)); } catch { /* ignore */ }
    throw new Error(`Thumbnail generation failed: ${stderr.slice(-100)}`);
  }
}
