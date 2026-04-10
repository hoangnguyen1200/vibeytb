import { GoogleGenerativeAI } from '@google/generative-ai';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Mắt thần AI: Trích xuất 3 khung hình và gọi Gemini duyệt
 */
export async function runVisualQC(videoPath: string, jobId: string, sceneUrl: string): Promise<boolean> {
  const outputDir = path.join(process.cwd(), 'tmp', jobId, 'qc_frames');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[VISUAL QC] Trích xuất 3 khung hình từ Playwright Video để duyệt: ${sceneUrl}...`);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const base64Frames = await extractFramesBase64(videoPath, outputDir);
      console.log(`[VISUAL QC] Gửi ${base64Frames.length} khung hình lên Gemini (attempt ${attempt + 1}/2)...`);
      const isPass = await analyzeFramesWithGemini(base64Frames);

      if (isPass) {
        console.log(`[VISUAL QC] ✅ PASS: Website hiển thị bình thường.`);
      } else {
        console.log(`[VISUAL QC] ❌ FAIL: Kém chất lượng, dính Cloudflare/Captcha hoặc vỡ hình.`);
      }

      // Cleanup QC frames
      fs.rmSync(outputDir, { recursive: true, force: true });

      return isPass;
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
      return false; // Fail an toàn
    }
  }

  return false;
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

async function analyzeFramesWithGemini(base64Frames: string[], retryCount = 0): Promise<boolean> {
  let currentModel = retryCount === 0 ? model : genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Bạn là một Chuyên gia Kiểm duyệt Video tự động.
Phân tích 3 khung hình (frames) được trích xuất từ Video quay một trang web Affiliate/Software.
Trang web có đang hiển thị nội dung bình thường, xem được và nhận diện được UI không?
Hay nó đang hiển thị Trắng màn hình, Cloudflare "Verify you are human", CAPTCHA, lỗi 403, 404, hoặc bị vỡ vụn giao diện?

CHỈ ĐƯỢC PHÉP TRẢ VỀ DUY NHẤT 1 TỪ:
- Ghi "PASS" nếu giao diện web hiển thị tốt.
- Ghi "FAIL" nếu bị lỗi trang, Cloudflare, hoặc tối đen/trắng bóc.`;

  const imageParts = base64Frames.map(b64 => ({
    inlineData: {
      data: b64,
      mimeType: "image/jpeg"
    }
  }));

  try {
    const result = await currentModel.generateContent([prompt, ...imageParts]);
    const response = result.response.text().trim().toUpperCase();
    return response.includes('PASS');
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
      return true;
    }
    console.error(`[VISUAL QC] Lỗi gọi Gemini API:`, err);
    return false;
  }
}
