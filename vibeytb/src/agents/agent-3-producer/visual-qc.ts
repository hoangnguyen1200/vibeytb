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
  try {
    const base64Frames = await extractFramesBase64(videoPath, outputDir);
    console.log(`[VISUAL QC] Gửi ${base64Frames.length} khung hình lên Gemini 1.5 Flash...`);
    const isPass = await analyzeFramesWithGemini(base64Frames);
    
    if (isPass) {
        console.log(`[VISUAL QC] ✅ PASS: Website hiển thị bình thường.`);
    } else {
        console.log(`[VISUAL QC] ❌ FAIL: Kém chất lượng, dính Cloudflare/Captcha hoặc vỡ hình.`);
    }

    // Cleanup ảnh rác
    fs.rmSync(outputDir, { recursive: true, force: true });
    
    return isPass;
  } catch (error) {
    console.error(`[VISUAL QC] Lỗi trong quá trình trích xuất/duyệt:`, error);
    return false; // Fail an toàn
  }
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
        timestamps: ['20%', '50%', '80%'], // 3 thời điểm giữa video
        filename: 'frame_%i.jpg',
        folder: outputDir,
        size: '640x360' // Giảm dung lượng ảnh gửi API
      });
  });
}

async function analyzeFramesWithGemini(base64Frames: string[]): Promise<boolean> {
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
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = result.response.text().trim().toUpperCase();
    return response.includes('PASS');
  } catch (err) {
    console.error(`[VISUAL QC] Lỗi gọi Gemini API:`, err);
    return false;
  }
}
