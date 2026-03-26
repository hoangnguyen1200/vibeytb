import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

/**
 * Generate a 3-second outro CTA clip using FFmpeg.
 * Black background + white text with Subscribe CTA.
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
      .input('anullsrc=r=48000:cl=stereo')
      .inputFormat('lavfi')
      .complexFilter([
        {
          filter: 'drawtext',
          options: {
            text: 'Follow @TechHustleLabs',
            fontcolor: 'white',
            fontsize: 42,
            x: '(w-text_w)/2',
            y: '(h/2)-60',
            font: 'Impact',
          },
          inputs: '0:v',
          outputs: 'txt1',
        },
        {
          filter: 'drawtext',
          options: {
            text: 'Subscribe for daily AI tools!',
            fontcolor: '#CCCCCC',
            fontsize: 32,
            x: '(w-text_w)/2',
            y: '(h/2)+20',
            font: 'Impact',
          },
          inputs: 'txt1',
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
