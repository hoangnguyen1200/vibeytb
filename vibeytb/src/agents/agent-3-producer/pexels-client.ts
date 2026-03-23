import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from 'pexels';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface PexelsVideoFile {
  quality: string;
  file_type: string;
  link: string;
}

interface PexelsVideo {
  video_files: PexelsVideoFile[];
}

interface PexelsResponse {
  videos?: PexelsVideo[];
}

/**
 * Sinh video giả (Dummy) để fallback khi Pexels API sập hoàn toàn
 */
async function generateDummyVideo(filePath: string, sceneIndex: number): Promise<string> {
    console.log(`   🛡️ [Pexels] Kích hoạt Ultimate Fallback. Tạo Dummy Video (Dark Gray) 5 giây cho Scene ${sceneIndex}...`);
    return new Promise((resolve, reject) => {
        ffmpeg()
            // Tạo một video màn hình mảng màu xám (gray), kích thước dọc, độ dài 5 giây
            .input('color=c=gray:s=1080x1920:d=5')
            .inputFormat('lavfi')
            .outputOptions([
                '-c:v libx264',
                '-r 30',
                '-pix_fmt yuv420p'
            ])
            .save(filePath)
            .on('end', () => {
                 console.log(`   ✅ [Fallback] Dummy Video tạo thành công tại: ${filePath}`);
                 resolve(filePath);
            })
            .on('error', (err) => {
                 console.error(`   ❌ [Fallback] Lỗi tạo Dummy Video bằng FFmpeg:`, err);
                 reject(err);
            });
    });
}

/**
 * Gọi API Pexels để tìm và tải video stock miễn phí
 * @param searchKeywords Từ khóa do AI cung cấp (VD: "nature river")
 * @param projectId ID Project để chia thư mục
 * @param sceneIndex Thứ tự Scene
 * @returns Đường dẫn tới file video mp4 đã tải
 */
export async function downloadStockVideo(
  searchKeywords: string,
  projectId: string,
  sceneIndex: number
): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', projectId);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const fileName = `scene_${sceneIndex}_stock_${crypto.randomBytes(4).toString('hex')}.mp4`;
  const filePath = path.join(tmpDir, fileName);

  console.log(`🎬 [Pexels Client] Đang tìm kiếm video miễn phí cho từ khóa: "${searchKeywords}"...`);

  const maxRetries = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const pexelsApiKey = process.env.PEXELS_API_KEY;
      if (!pexelsApiKey) {
        throw new Error('❌ [Pexels Client] Lỗi cấu hình: Thiếu biến môi trường PEXELS_API_KEY trong file .env');
      }

      const client = createClient(pexelsApiKey);

      // Tìm video trên Pexels ưu tiên màn hình dọc (portrait)
      const query = searchKeywords || 'beautiful';
      const response = await client.videos.search({ 
          query, 
          per_page: 5,
          orientation: 'portrait',
          size: 'medium'
      }) as unknown as PexelsResponse;

      if (!response || !response.videos || response.videos.length === 0) {
        console.warn(`   ⚠️ Lần thử ${attempt}: Không tìm thấy video dọc cho "${query}". Chuyển sang tìm video ngang/bất kỳ...`);
        // Thử lại lần 2 không giới hạn orientation
        const fallbackResponse = await client.videos.search({ 
            query, 
            per_page: 5 
        }) as unknown as PexelsResponse;
        if (!fallbackResponse || !fallbackResponse.videos || fallbackResponse.videos.length === 0) {
            throw new Error(`Không tìm thấy bất kỳ video nào trên Pexels cho từ khóa: ${query}`);
        }
        response.videos = fallbackResponse.videos;
      }

      // Chọn video ngẫu nhiên để tránh lặp lại
      const randomIndex = Math.floor(Math.random() * response.videos.length);
      const selectedVideo = response.videos[randomIndex];
      
      // Tìm link mp4 chất lượng phù hợp (HD)
      const videoFiles = selectedVideo.video_files;
      let targetFile = videoFiles.find((f: PexelsVideoFile) => f.quality === 'hd' && f.file_type === 'video/mp4');
      if (!targetFile) {
          // Lấy link đầu tiên nếu không có HD
          targetFile = videoFiles.find((f: PexelsVideoFile) => f.file_type === 'video/mp4') || videoFiles[0];
      }

      if (!targetFile || !targetFile.link) {
           throw new Error('Không trích xuất được file MP4 từ Pexels.');
      }

      console.log(`   ⬇️ Đang tải video từ Pexels: ${targetFile.link}`);

      // Download video buffer
      const videoResponse = await axios.get(targetFile.link, { responseType: 'stream' });
      
      // Pipe to file
      const stream = fs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
          videoResponse.data.pipe(stream);
          stream.on('finish', () => resolve(true));
          stream.on('error', reject);
      });

      console.log(`✅ [Pexels Client] Cảnh quay ${sceneIndex} tải hoàn tất ở lần thử ${attempt}. Đã lưu tại: ${filePath}`);

      return filePath;

    } catch (error: unknown) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`   ⚠️ [Pexels Client] Lỗi (Attempt ${attempt}/${maxRetries}): ${errorMessage}`);
      
      if (attempt < maxRetries) {
        // Exponential Backoff: Lần 1 (3s), Lần 2 (6s), Lần 3 (10s)
        const waitTime = attempt === 1 ? 3000 : (attempt === 2 ? 6000 : 10000);
        console.log(`   ⏳ Server Pexels đang bận, đợi ${waitTime / 1000}s trước khi thử lại...`);
        await delay(waitTime);
      }
    }
  }

  // Nếu tất cả các lần Retry đều thất bại, gọi hàm Fallback Video
  const finalErrorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`❌ [Pexels Client] Đã thử lại ${maxRetries} lần nhưng đều thất bại do: ${finalErrorMessage || 'Unknown'}`);
  return await generateDummyVideo(filePath, sceneIndex);
}
