import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

/**
 * Generate a YouTube thumbnail (1280×720) from the final video.
 * Extracts a frame at ~2s and overlays the tool name on a dark bar.
 */
export async function generateThumbnail(
  videoPath: string,
  toolName: string,
  jobId: string,
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
    .replace(/'/g, "\\\\'")
    .replace(/:/g, '\\\\:');

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(2)
      .frames(1)
      .complexFilter([
        // Scale + crop to 1280x720
        {
          filter: 'scale',
          options: '1280:720:force_original_aspect_ratio=increase',
          inputs: '0:v',
          outputs: 'scaled',
        },
        {
          filter: 'crop',
          options: '1280:720',
          inputs: 'scaled',
          outputs: 'cropped',
        },
        // Semi-transparent black bar at bottom
        {
          filter: 'drawbox',
          options: {
            x: 0,
            y: 'ih-120',
            w: 'iw',
            h: 120,
            color: 'black@0.7',
            t: 'fill',
          },
          inputs: 'cropped',
          outputs: 'boxed',
        },
        // Tool name text on bar
        {
          filter: 'drawtext',
          options: {
            text: safeToolName,
            fontcolor: 'white',
            fontsize: 48,
            x: '(w-text_w)/2',
            y: 'h-90',
            font: 'Impact',
          },
          inputs: 'boxed',
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
