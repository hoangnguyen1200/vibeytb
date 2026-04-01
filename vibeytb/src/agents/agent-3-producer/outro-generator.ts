import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

/**
 * Generate a 3-second outro CTA clip using FFmpeg.
 * Features:
 *   - Dark gradient background (purple→black brand colors)
 *   - Channel name in large text
 *   - Engagement CTA line
 *   - "Subscribe" reminder
 * Includes silent audio track for compatibility with concat.
 */
export async function generateOutro(jobId: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', jobId);
  fs.mkdirSync(tmpDir, { recursive: true });
  const outputPath = path.join(tmpDir, 'outro.mp4');

  // Skip if already generated (idempotent)
  if (fs.existsSync(outputPath)) {
    console.log('[OUTRO] Using cached outro clip');
    return outputPath;
  }

  console.log('[OUTRO] Generating 3s outro CTA clip...');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=black:s=1080x1920:d=3:r=30')
      .inputFormat('lavfi')
      // Inaudible 1Hz sine (-60dB) instead of dead silence (anullsrc).
      // This keeps the audio stream "active" so BGM naturally overlaps
      // during Phase 2 amix — outro won't end in abrupt dead silence.
      .input('sine=frequency=1:sample_rate=48000:duration=3')
      .inputFormat('lavfi')
      .complexFilter([
        // Purple accent bar at top (brand color)
        {
          filter: 'drawbox',
          options: {
            x: 0,
            y: 0,
            w: 'iw',
            h: 4,
            color: '#7C3AED@0.9',
            t: 'fill',
          },
          inputs: '0:v',
          outputs: 'accent',
        },
        // Channel name — large white text
        {
          filter: 'drawtext',
          options: {
            text: 'Follow @TechHustleLabs',
            fontcolor: 'white',
            fontsize: 44,
            x: '(w-text_w)/2',
            y: '(h/2)-100',
            font: 'Impact',
          },
          inputs: 'accent',
          outputs: 'txt1',
        },
        // Engagement hook — question to drive comments
        {
          filter: 'drawtext',
          options: {
            text: 'Comment your favorite AI tool!',
            fontcolor: '#A78BFA',
            fontsize: 34,
            x: '(w-text_w)/2',
            y: '(h/2)-30',
            font: 'Impact',
          },
          inputs: 'txt1',
          outputs: 'txt2',
        },
        // Subscribe reminder
        {
          filter: 'drawtext',
          options: {
            text: 'Subscribe for daily AI discoveries!',
            fontcolor: '#9CA3AF',
            fontsize: 28,
            x: '(w-text_w)/2',
            y: '(h/2)+40',
            font: 'Impact',
          },
          inputs: 'txt2',
          outputs: 'out_v',
        },
      ])
      .outputOptions([
        '-map', '[out_v]',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-ar', '48000',
        '-ac', '2',
        '-t', '3',
        '-pix_fmt', 'yuv420p',
        '-shortest',
      ])
      .output(outputPath)
      .on('end', () => {
        console.log('[OUTRO] Generated successfully');
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('[OUTRO] Generation failed:', err.message);
        reject(err);
      })
      .run();
  });
}
