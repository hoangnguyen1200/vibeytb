import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Tải nhạc nền (Background Music) từ Pixabay Music API dựa trên từ khóa cảm xúc.
 * Chọn ngẫu nhiên 1 trong top 5 kết quả đầu tiên.
 * Nếu có lỗi hoặc không tìm thấy, hệ thống sẽ tự fallback về một bài nhạc local có sẵn trong thư mục assets/bgm.
 *
 * Yêu cầu: Đã đăng ký Pixabay API Key (https://pixabay.com/api/docs/) và thêm vào .env.
 * 
 * @param mood Từ khóa cảm xúc (vd: "lofi", "epic", "upbeat")
 * @param projectId Mã ID của Job hiện tại để lưu vào thư mục tương ứng
 * @returns Đường dẫn tới file BGM tải về (.mp3) hoặc file fallback local (hoặc null nếu không có fallback).
 */
export async function downloadBGMFromPixabay(mood: string, projectId: string): Promise<string | null> {
  console.log(`🎵 [Pixabay Client] Đang tìm kiếm BGM cho cảm xúc: "${mood}"...`);
  
  const apiKey = process.env.PIXABAY_API_KEY;
  const tmpDir = path.join(process.cwd(), 'tmp', projectId);
  
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // Fallback function: Giúp hệ thống không sập khi rớt mạng hoặc API key hết hạn / ko hợp lệ
  const getFallbackBgm = () => {
    console.log(`   ⚠️ [Pixabay Client] Kích hoạt Fallback: Tìm nhạc nền cục bộ tại assets/bgm/...`);
    const bgmDir = path.join(process.cwd(), 'assets', 'bgm');
    if (fs.existsSync(bgmDir)) {
        const files = fs.readdirSync(bgmDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        if (files.length > 0) {
            const randomFile = files[Math.floor(Math.random() * files.length)];
            const fallbackPath = path.join(bgmDir, randomFile);
            console.log(`   ✅ [Pixabay Fallback] Đã chọn BGM cục bộ: ${randomFile}`);
            return fallbackPath;
        }
    }
    console.log(`   ❌ [Pixabay Fallback] Thư mục assets/bgm/ trống hoặc không tồn tại. Bỏ qua chèn BGM.`);
    return null;
  };

  if (!apiKey) {
    console.warn(`⚠️ [Pixabay Client] Thiếu cấu hình PIXABAY_API_KEY trong .env!`);
    return getFallbackBgm();
  }

  let retries = 0;
  const maxRetries = 2;
  const backoffDelays = [3000, 5000];

  while (retries <= maxRetries) {
      try {
        // Gọi Pixabay Audio API
        // Tham khảo: https://pixabay.com/api/docs/#api_audio
        const response = await axios.get('https://pixabay.com/api/audio/', {
          params: {
            key: apiKey,
            q: encodeURIComponent(mood),
            per_page: 5,   // Chỉ lấy top 5 kết quả
          }
        });
    
        const hits = response.data.hits;

    if (!hits || hits.length === 0) {
      console.warn(`⚠️ [Pixabay Client] Không tìm thấy bài hát nào cho từ khóa "${mood}".`);
      return getFallbackBgm();
    }

    // Tránh việc video nào cũng trùng 1 nhạc khi chung 1 mood -> chọn ngẫu nhiên 1 track top đầu
    const randomTrack = hits[Math.floor(Math.random() * hits.length)];
    const audioUrl = randomTrack.audio; // URL tải file mp3 của Pixabay
    const audioName = randomTrack.name || "pixabay_track";

    console.log(`   ⬇️ Đang tải BGM từ Pixabay: The track is "${audioName}" (${audioUrl})...`);

    const audioResponse = await axios({
        url: audioUrl,
        method: 'GET',
        responseType: 'stream'
    });

    const fileExt = '.mp3';
    const randomHash = crypto.randomBytes(4).toString('hex');
    const localFilePath = path.join(tmpDir, `bgm_${mood}_${randomHash}${fileExt}`);
    
    return new Promise((resolve) => {
        const writer = fs.createWriteStream(localFilePath);
        audioResponse.data.pipe(writer);
        writer.on('finish', () => {
            console.log(`   ✅ [Pixabay Client] Tải BGM hoàn tất. Đã lưu tại: ${localFilePath}`);
            resolve(localFilePath);
        });
        writer.on('error', (err) => {
            console.error(`❌ [Pixabay Client] Lỗi khi ghi file luồng BGM:`, err.message);
            resolve(getFallbackBgm()); // Vẫn fallback nếu lỗi ghi file
        });
    });

      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response && error.response.status === 429 && retries < maxRetries) {
            console.warn(`   ⚠️ [Pixabay Client] Lỗi HTTP 429: Too Many Requests. Đang thử lại sau ${backoffDelays[retries] / 1000} giây...`);
            await new Promise(r => setTimeout(r, backoffDelays[retries]));
            retries++;
        } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ [Pixabay Client] Lỗi API Pixabay (${errorMessage}). Dừng kết nối và dùng phương án dự phòng.`);
            return getFallbackBgm();
        }
      }
  }

  return getFallbackBgm();
}
