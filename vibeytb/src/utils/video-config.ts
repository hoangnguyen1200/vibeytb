/**
 * Video pipeline configuration — Single Source of Truth.
 * All video dimensions, encoding, and subtitle constants live here.
 * Import from this module instead of hardcoding values.
 */

// === Video Dimensions (9:16 portrait for YouTube Shorts / TikTok) ===
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;

// === Encoding (VBR for YouTube quality) ===
export const VBR_TARGET = '3.5M';
export const VBR_MIN = '2.5M';
export const VBR_MAX = '8M';
export const VBR_BUFSIZE = '16M';
export const AUDIO_BITRATE = '128k';
export const AUDIO_SAMPLE_RATE = 48000;

// === Subtitle (ASS format) ===
export const SUB_FONTSIZE = 28;
export const SUB_MARGIN_V = 200;
export const SUB_MARGIN_LR = 80;

// === Helpers ===
/** FFmpeg lavfi color source string, e.g. "color=c=black:s=1080x1920:d=3:r=30" */
export function colorSource(color: string, durationSec: number): string {
  return `color=c=${color}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${durationSec}:r=${VIDEO_FPS}`;
}

/** FFmpeg pad filter options string, e.g. "1080:1920:(ow-iw)/2:(oh-ih)/2:color=black" */
export const PAD_FILTER_OPTIONS = `${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`;

/** Common VBR output options for FFmpeg */
export const VBR_OUTPUT_OPTIONS = [
  '-c:v', 'libx264',
  '-preset', 'fast',
  `-b:v`, VBR_TARGET,
  `-minrate`, VBR_MIN,
  `-maxrate`, VBR_MAX,
  `-bufsize`, VBR_BUFSIZE,
  '-pix_fmt', 'yuv420p',
  `-r`, String(VIDEO_FPS),
  '-c:a', 'aac',
  `-b:a`, AUDIO_BITRATE,
  `-ar`, String(AUDIO_SAMPLE_RATE),
  '-ac', '2',
];
