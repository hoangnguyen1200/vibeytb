import { GoogleGenerativeAI } from '@google/generative-ai';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/** Visual QC result: pass = safe to use, quality = richness level */
export interface VisualQCResult {
  pass: boolean;
  quality: 'pass' | 'weak' | 'fail';
}
/**
 * Mắt thần AI: Trích xuất 3 khung hình và gọi Gemini duyệt.
 * Returns 3-level quality assessment: PASS (visual-rich), WEAK (text-heavy), FAIL (broken/blocked).
 */
export async function runVisualQC(videoPath: string, jobId: string, sceneUrl: string): Promise<VisualQCResult> {
  const outputDir = path.join(process.cwd(), 'tmp', jobId, 'qc_frames');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[VISUAL QC] Trích xuất 3 khung hình từ Playwright Video để duyệt: ${sceneUrl}...`);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const base64Frames = await extractFramesBase64(videoPath, outputDir);
      console.log(`[VISUAL QC] Gửi ${base64Frames.length} khung hình lên Gemini (attempt ${attempt + 1}/2)...`);
      const quality = await analyzeFramesWithGemini(base64Frames);

      if (quality === 'pass') {
        console.log(`[VISUAL QC] ✅ PASS: Website hiển thị bình thường, visual-rich.`);
      } else if (quality === 'weak') {
        console.log(`[VISUAL QC] ⚠️ WEAK: Website hiển thị OK nhưng chủ yếu là text (low visual appeal).`);
      } else {
        console.log(`[VISUAL QC] ❌ FAIL: Kém chất lượng, dính Cloudflare/Captcha hoặc vỡ hình.`);
      }

      // Cleanup QC frames
      fs.rmSync(outputDir, { recursive: true, force: true });

      // WEAK = still usable (pass=true) but logged as warning
      return { pass: quality !== 'fail', quality };
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient = /timeout|ECONNRESET|ENOTFOUND|500|502|503|504|fetch failed/i.test(msg);

      if (attempt === 0 && isTransient) {
        console.warn(`[VISUAL QC] ⚠️ Transient error (attempt 1/2): ${msg}. Retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      console.error(`[VISUAL QC] Lỗi trong quá trình trích xuất/duyệt:`, error);
      // Cleanup on error
      try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return { pass: false, quality: 'fail' }; // Fail an toàn
    }
  }

  return { pass: false, quality: 'fail' };
}

async function extractFramesBase64(videoPath: string, outputDir: string): Promise<string[]> {
  const file1 = path.join(outputDir, 'frame_1.jpg');
  const file2 = path.join(outputDir, 'frame_2.jpg');
  const file3 = path.join(outputDir, 'frame_3.jpg');

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .on('end', () => {
        try {
          const b1 = fs.readFileSync(file1).toString('base64');
          const b2 = fs.readFileSync(file2).toString('base64');
          const b3 = fs.readFileSync(file3).toString('base64');
          resolve([b1, b2, b3]);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => reject(err))
      .screenshots({
        // Start from 50% — skip initial loading/Cloudflare challenge frames
        timestamps: ['50%', '75%', '90%'],
        filename: 'frame_%i.jpg',
        folder: outputDir,
        size: '640x360' // Giảm dung lượng ảnh gửi API
      });
  });
}

async function analyzeFramesWithGemini(base64Frames: string[], retryCount = 0): Promise<'pass' | 'weak' | 'fail'> {
  let currentModel = retryCount === 0 ? model : genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `You are an automated Video Quality Inspector for a YouTube Shorts production pipeline.
Analyze these 3 frames extracted from a screen recording of a website.

Respond with EXACTLY one word:
- "PASS" — Website loads correctly AND has visual-rich content (images, product screenshots, colorful UI elements, interactive demos, graphics).
- "WEAK" — Website loads correctly but is mostly TEXT content (walls of text, blog-style articles, terms pages, documentation). The page looks boring as video content.
- "FAIL" — Page shows error, Cloudflare "Verify you are human" challenge, CAPTCHA, blank/white/black screen, 403/404 error, or broken layout.`;

  const imageParts = base64Frames.map(b64 => ({
    inlineData: {
      data: b64,
      mimeType: "image/jpeg"
    }
  }));

  try {
    const result = await currentModel.generateContent([prompt, ...imageParts]);
    const response = result.response.text().trim().toUpperCase();
    if (response.includes('PASS')) return 'pass';
    if (response.includes('WEAK')) return 'weak';
    return 'fail';
  } catch (err: any) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isQuotaError = err.status === 429 || err.status === 404
      || err.status === 503
      || errorMessage.toLowerCase().includes('quota')
      || errorMessage.toLowerCase().includes('overloaded')
      || errorMessage.toLowerCase().includes('high demand');
    if (retryCount === 0 && isQuotaError) {
      console.log(`[VISUAL QC MODEL FALLBACK] ${err.status || 'error'} on primary → switching to gemini-2.0-flash`);
      return analyzeFramesWithGemini(base64Frames, 1);
    }
    if (isQuotaError) {
      console.log('[VISUAL QC] ⚠️ Gemini unavailable (quota/overloaded) on both models → Auto-PASS to keep pipeline alive.');
      return 'pass';
    }
    console.error(`[VISUAL QC] Lỗi gọi Gemini API:`, err);
    return 'fail';
  }
}
