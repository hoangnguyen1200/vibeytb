/**
 * Convert animated WebP to MP4 — frame-by-frame extraction to avoid pixel limit
 */
import sharp from 'sharp';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  console.error('Usage: node webp-to-mp4.mjs <input.webp> <output.mp4>');
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webp2mp4-'));
console.log(`[1/3] Extracting frames one-by-one...`);
console.log(`  Temp dir: ${tmpDir}`);

try {
  // First get metadata for frame count - use limitInputPixels override
  const meta = await sharp(input, { animated: true, pages: -1, limitInputPixels: false }).metadata();
  const pages = meta.pages || 1;
  const width = meta.width;
  const height = meta.pageHeight || meta.height;
  const delay = meta.delay || [];
  
  console.log(`  ${pages} frames, ${width}x${height}`);
  
  const avgDelay = delay.length > 0 
    ? delay.reduce((a, b) => a + b, 0) / delay.length 
    : 200;
  const fps = Math.max(2, Math.min(30, Math.round(1000 / avgDelay)));
  console.log(`  Avg delay: ${avgDelay.toFixed(0)}ms → ${fps} FPS`);

  // Extract EACH frame individually (no pixel limit issue)
  for (let i = 0; i < pages; i++) {
    const framePath = path.join(tmpDir, `frame_${String(i).padStart(5, '0')}.png`);
    await sharp(input, { page: i, limitInputPixels: false })
      .png({ quality: 80, compressionLevel: 6 })
      .toFile(framePath);
    
    if (i % 100 === 0 || i === pages - 1) {
      process.stdout.write(`  ${i + 1}/${pages} frames\r`);
    }
  }
  console.log(`\n  Extracted ${pages} frames ✅`);

  // Encode to MP4
  console.log(`[2/3] Encoding MP4 at ${fps}fps...`);
  const cmd = `ffmpeg -y -framerate ${fps} -i "${path.join(tmpDir, 'frame_%05d.png')}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 -movflags +faststart "${output}"`;
  execSync(cmd, { stdio: 'inherit' });

  const outSize = fs.statSync(output).size;
  console.log(`[3/3] ✅ Done! ${output}`);
  console.log(`  Size: ${(outSize / 1024 / 1024).toFixed(1)} MB`);
  
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('  Cleanup done');
}
