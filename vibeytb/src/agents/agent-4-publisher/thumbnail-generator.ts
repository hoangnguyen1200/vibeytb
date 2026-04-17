import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { ffmpegPath } from '../../utils/ffmpeg';
import { fontParam } from '../../utils/font-detect';

// ─── Thumbnail Style Definitions ───────────────────────────────────────────

export type ThumbnailStyleId = 'editorial' | 'minimalist' | 'bold_gradient';

interface ThumbnailStyle {
  id: ThumbnailStyleId;
  name: string;
  buildFilters: (ctx: ThumbContext) => string;
}

interface ThumbContext {
  safeToolName: string;
  safeBadge: string;
  font: string;
}

/**
 * Determine the badge text based on the tool's tagline content.
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
  const badges = ['FREE', 'NEW', 'TRENDING'];
  return badges[new Date().getDay() % badges.length];
}

/**
 * Escape text for FFmpeg drawtext filter (execSync + double-quoted -vf "...").
 * Only escapes characters that break FFmpeg filter syntax.
 * NOTE: Do NOT pass fontParam() through this — only user-facing text.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/'/g, '\u2019')
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}

// ─── Style A: Editorial (original style with refinements) ──────────────────

const editorialStyle: ThumbnailStyle = {
  id: 'editorial',
  name: 'Editorial',
  buildFilters: (ctx) => [
    // Dark vignette top bar
    "drawbox=x=0:y=0:w=iw:h=80:color=black@0.5:t=fill",
    // Purple accent bar top
    "drawbox=x=0:y=0:w=iw:h=5:color=#7C3AED@0.95:t=fill",
    // Dark gradient bar at bottom (180px)
    "drawbox=x=0:y=ih-180:w=iw:h=180:color=black@0.8:t=fill",
    // Purple accent line on gradient
    "drawbox=x=0:y=ih-180:w=iw:h=3:color=#7C3AED@0.9:t=fill",
    // Badge background — top-right (red)
    "drawbox=x=iw-220:y=15:w=200:h=50:color=#EF4444@0.9:t=fill",
    // Badge text
    `drawtext=text='${ctx.safeBadge}':fontcolor=white:fontsize=28:x=iw-200:y=24:${ctx.font}`,
    // Tool name — large (centered in gradient)
    `drawtext=text='${ctx.safeToolName}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=h-155:${ctx.font}:borderw=2:bordercolor=black`,
    // Subtitle
    `drawtext=text='AI Tool Review':fontcolor=#A78BFA:fontsize=28:x=(w-text_w)/2:y=h-60:${ctx.font}`,
  ].join(','),
};

// ─── Style B: Minimalist (dark bar + clean text) ──────────────────────────

const minimalistStyle: ThumbnailStyle = {
  id: 'minimalist',
  name: 'Minimalist',
  buildFilters: (ctx) => [
    // Full-width dark overlay bottom half
    "drawbox=x=0:y=ih/2:w=iw:h=ih/2:color=black@0.75:t=fill",
    // Thin white separator line
    "drawbox=x=60:y=ih/2:w=iw-120:h=2:color=white@0.6:t=fill",
    // Tool name — centered, extra large
    `drawtext=text='${ctx.safeToolName}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=h/2+60:${ctx.font}:borderw=3:bordercolor=black@0.5`,
    // Subtitle — clean, small
    `drawtext=text='AI Tool Review':fontcolor=#E0E0E0:fontsize=24:x=(w-text_w)/2:y=h/2+160:${ctx.font}`,
    // Badge pill — top-left
    "drawbox=x=30:y=30:w=160:h=44:color=#10B981@0.9:t=fill",
    `drawtext=text='${ctx.safeBadge}':fontcolor=white:fontsize=24:x=60:y=40:${ctx.font}`,
  ].join(','),
};

// ─── Style C: Bold Gradient (vibrant, high-energy) ────────────────────────

const boldGradientStyle: ThumbnailStyle = {
  id: 'bold_gradient',
  name: 'Bold Gradient',
  buildFilters: (ctx) => [
    // Full dark overlay for vibrancy
    "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill",
    // Gradient bar bottom (tall, vibrant purple)
    "drawbox=x=0:y=ih-240:w=iw:h=240:color=#4C1D95@0.85:t=fill",
    // Accent glow line
    "drawbox=x=0:y=ih-240:w=iw:h=4:color=#F59E0B@0.95:t=fill",
    // Diagonal badge — top-left corner
    "drawbox=x=0:y=0:w=280:h=60:color=#F59E0B@0.9:t=fill",
    `drawtext=text='${ctx.safeBadge}':fontcolor=#1F2937:fontsize=30:x=40:y=14:${ctx.font}`,
    // Tool name — extra bold, bottom area
    `drawtext=text='${ctx.safeToolName}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=h-200:${ctx.font}:borderw=4:bordercolor=#4C1D95`,
    // Tagline
    `drawtext=text='The AI Tool You NEED':fontcolor=#FDE68A:fontsize=28:x=(w-text_w)/2:y=h-100:${ctx.font}`,
    // Bottom brand bar
    "drawbox=x=0:y=ih-40:w=iw:h=40:color=#F59E0B@0.8:t=fill",
    `drawtext=text='@TechHustleLabs':fontcolor=#1F2937:fontsize=20:x=(w-text_w)/2:y=h-34:${ctx.font}`,
  ].join(','),
};

// ─── Style Registry ───────────────────────────────────────────────────────

const THUMBNAIL_STYLES: ThumbnailStyle[] = [
  editorialStyle,
  minimalistStyle,
  boldGradientStyle,
];

/**
 * Select a thumbnail style — random per run to diversify.
 * Returns the style ID for tracking in Supabase.
 */
function selectThumbnailStyle(): ThumbnailStyle {
  const index = Math.floor(Math.random() * THUMBNAIL_STYLES.length);
  return THUMBNAIL_STYLES[index];
}

// ─── Main Generator ───────────────────────────────────────────────────────

/**
 * Generate a YouTube thumbnail (1280×720) from the final video.
 *
 * Uses a 2-pass FFmpeg approach:
 *   Pass 1: Extract frame → scale+crop to 1280×720 → temp PNG
 *   Pass 2: Load landscape PNG → apply style overlays → final JPG
 *
 * Returns: { thumbnailPath, thumbnailStyle }
 */
export async function generateThumbnail(
  videoPath: string,
  toolName: string,
  jobId: string,
  tagline?: string,
): Promise<{ thumbnailPath: string; thumbnailStyle: ThumbnailStyleId }> {
  const tmpDir = path.join(process.cwd(), 'tmp', jobId);
  fs.mkdirSync(tmpDir, { recursive: true });
  const outputPath = path.join(tmpDir, 'thumbnail.jpg');

  // Select style for this run
  const style = selectThumbnailStyle();

  // Skip if already generated (idempotent)
  if (fs.existsSync(outputPath)) {
    console.log(`[THUMBNAIL] Using cached thumbnail (style: ${style.id})`);
    return { thumbnailPath: outputPath, thumbnailStyle: style.id };
  }

  console.log(`[THUMBNAIL] Generating thumbnail — Style: "${style.name}" (${style.id})`);

  const safeToolName = escapeDrawtext(toolName);
  const badge = pickBadge(tagline || '');
  const safeBadge = escapeDrawtext(badge);
  const font = fontParam();

  const ctx: ThumbContext = { safeToolName, safeBadge, font };

  // Normalize paths for FFmpeg
  const inputPath = videoPath.replace(/\\/g, '/');
  const outPath = outputPath.replace(/\\/g, '/');
  const safeFfmpegPath = ffmpegPath.replace(/\\/g, '/');

  // --- PASS 1: Extract frame → scale+crop to 1280×720 PNG ---
  const tempFramePath = path.join(tmpDir, 'thumb_frame.png').replace(/\\/g, '/');
  const pass1Cmd = [
    `"${safeFfmpegPath}"`,
    '-y -ss 4',
    `-i "${inputPath}"`,
    '-frames:v 1',
    '-vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720"',
    `"${tempFramePath}"`,
  ].join(' ');

  // --- PASS 2: Apply style overlays ---
  const overlayFilters = style.buildFilters(ctx);

  const pass2Cmd = [
    `"${safeFfmpegPath}"`,
    '-y',
    `-i "${tempFramePath}"`,
    `-vf "${overlayFilters}"`,
    `-q:v 2`,
    `"${outPath}"`,
  ].join(' ');

  try {
    execSync(pass1Cmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
    console.log('[THUMBNAIL] Pass 1: Frame extracted (1280x720)');

    try {
      execSync(pass2Cmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
      console.log(`[THUMBNAIL] Pass 2: "${style.name}" style applied`);
    } catch (pass2Err) {
      // Style crashed (e.g., Editorial drawtext chain) — fallback to Minimalist
      if (style.id !== 'minimalist') {
        console.warn(`[THUMBNAIL] "${style.name}" crashed → retrying with Minimalist`);
        const fallbackFilters = minimalistStyle.buildFilters(ctx);
        const fallbackCmd = [
          `"${safeFfmpegPath}"`,
          '-y',
          `-i "${tempFramePath}"`,
          `-vf "${fallbackFilters}"`,
          `-q:v 2`,
          `"${outPath}"`,
        ].join(' ');
        execSync(fallbackCmd, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
        console.log('[THUMBNAIL] Fallback Minimalist applied successfully');
        try { fs.unlinkSync(tempFramePath.replace(/\//g, path.sep)); } catch { /* ignore */ }
        return { thumbnailPath: outputPath, thumbnailStyle: 'minimalist' as ThumbnailStyleId };
      }
      throw pass2Err;
    }

    try { fs.unlinkSync(tempFramePath.replace(/\//g, path.sep)); } catch { /* ignore */ }

    console.log(`[THUMBNAIL] Generated successfully (style: ${style.id})`);
    return { thumbnailPath: outputPath, thumbnailStyle: style.id };
  } catch (err) {
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString() || '';
    console.error('[THUMBNAIL] Generation failed:', stderr.slice(-200));
    try { fs.unlinkSync(tempFramePath.replace(/\//g, path.sep)); } catch { /* ignore */ }
    throw new Error(`Thumbnail generation failed: ${stderr.slice(-100)}`);
  }
}
