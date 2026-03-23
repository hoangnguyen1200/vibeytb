import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);
import crypto from 'crypto';

import { EdgeTTS } from 'node-edge-tts';

/**
 * Chuyển đổi ms sang định dạng VTT Timestamp (HH:MM:SS.mmm)
 */
function msToVttTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Đọc file JSON subtitle do node-edge-tts sinh ra và convert sang dạng .vtt, sau đó xóa file .json
 */
function convertEdgeJsonToVtt(jsonPath: string, vttPath: string) {
  if (!fs.existsSync(jsonPath)) return;
  
  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const subs = JSON.parse(rawData) as Array<{ part: string, start: number, end: number }>;
  
  let vttContent = 'WEBVTT\n\n';
  
  for (let i = 0; i < subs.length; i += 3) {
    const group = subs.slice(i, i + 3);
    const startTime = msToVttTimestamp(group[0].start);
    const endTime = msToVttTimestamp(group[group.length - 1].end);
    
    // Nối các từ lại, xoá khoảng trắng thừa
    const text = group.map(sub => sub.part.trim()).join(' ');
    
    vttContent += `${startTime} --> ${endTime}\n${text}\n\n`;
  }
  
  fs.writeFileSync(vttPath, vttContent, 'utf-8');
  fs.unlinkSync(jsonPath); // Xoá file json dọn dẹp
}

/**
 * Lấy độ dài (duration) của một file media bằng FFprobe
 */
export async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }
      const duration = metadata.format.duration;
      if (duration === undefined) {
        return reject(new Error('Không thể đọc duration từ file media'));
      }
      resolve(duration);
    });
  });
}

/**
 * Tạo file Audio bằng Node-Edge-TTS miễn phí (Giọng Microsoft Edge tự nhiên)
 * @param text Đoạn văn bản cần đọc
 * @param projectId ID của project để nhóm file
 * @param sceneIndex Thứ tự cảnh (để đặt tên file)
 * @returns { filePath: string, vttPath: string, duration: number } Đường dẫn tới file audio, subtitle (.vtt) và độ dài
 */
export async function generateAudioFromText(
  text: string, 
  projectId: string, 
  sceneIndex: number
): Promise<{ filePath: string; vttPath: string; duration: number }> {
  
  const tmpDir = path.join(process.cwd(), 'tmp', projectId);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const fileName = `scene_${sceneIndex}_audio_${crypto.randomBytes(4).toString('hex')}.mp3`;
  const filePath = path.join(tmpDir, fileName);

  console.log(`🎙️ [TTS Client] Gọi Microsoft Edge TTS miễn phí cho Scene ${sceneIndex}...`);

  try {
    const tts = new EdgeTTS({
      voice: 'en-US-SteffanNeural', // Giọng nam Mỹ, review công nghệ năng lượng
      lang: 'en-US',
      outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
      saveSubtitles: true,
      rate: '+15%',
      pitch: '+2Hz'
    });

    await tts.ttsPromise(text, filePath);

    // Chuyển đổi JSON sinh ra (filePath + '.json') thành VTT cho FFmpeg đốt phụ đề
    const jsonSubPath = filePath + '.json';
    const vttPath = filePath.replace('.mp3', '.vtt');
    convertEdgeJsonToVtt(jsonSubPath, vttPath);

    // Đọc ffprobe để lấy chính xác duration
    const duration = await getMediaDuration(filePath); 
    
    console.log(`✅ [TTS Client] Render xong Edge-TTS Scene ${sceneIndex}. Duration: ${duration.toFixed(2)}s.`);

    return { filePath, vttPath, duration };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [TTS Client] Lỗi khi tạo Audio cho Scene ${sceneIndex}:`, errorMessage);
    throw error;
  }
}
