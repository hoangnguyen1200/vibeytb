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
 * Chuyển đổi ms sang định dạng VTT Timestamp (HH:MM:SS.mmm) — kept for reference
 */
function msToVttTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Chuyển đổi ms sang ASS Timestamp format (H:MM:SS.cc) — centiseconds
 */
function msToAssTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

/**
 * Đọc file JSON subtitle do node-edge-tts sinh ra và convert sang dạng .ass
 * ASS format bakes positioning into the file header — FFmpeg always respects it.
 * Using ASS instead of VTT because FFmpeg's `force_style` is unreliable for WebVTT.
 */
function convertEdgeJsonToAss(jsonPath: string, assPath: string) {
  if (!fs.existsSync(jsonPath)) return;
  
  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const subs = JSON.parse(rawData) as Array<{ part: string, start: number, end: number }>;
  
  // ASS header with bottom-center positioning baked in
  // PlayResX/Y = target video resolution (1080x1920 portrait)
  // Alignment=2 = bottom-center (ASS standard)
  // MarginV=200 = 200px from bottom edge → subtitle at y≈1720 (safe zone)
  const assHeader = `[Script Info]
Title: VibeYtb Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,17,&H00FFFFFF,&H000000FF,&H60000000,&HA0000000,1,0,0,0,100,100,0,0,4,1,0,2,80,80,200,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let assContent = assHeader;
  const MIN_CAPTION_MS = 1500;

  for (let i = 0; i < subs.length; i += 3) {
    const group = subs.slice(i, i + 3);
    const startMs = group[0].start;
    let endMs = group[group.length - 1].end;

    // Enforce minimum 1.5s display time for readability
    if (endMs - startMs < MIN_CAPTION_MS) {
      endMs = startMs + MIN_CAPTION_MS;
    }
    // Don't overlap with next caption group
    const nextGroup = subs[i + 3];
    if (nextGroup && endMs > nextGroup.start) {
      endMs = nextGroup.start - 50; // 50ms gap
    }

    const startTime = msToAssTimestamp(startMs);
    const endTime = msToAssTimestamp(endMs);

    // Nối các từ lại, xoá khoảng trắng thừa
    const text = group.map(sub => sub.part.trim()).join(' ');
    
    assContent += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
  }
  
  fs.writeFileSync(assPath, assContent, 'utf-8');
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

  console.log(`🎙️ [TTS Client] Calling Microsoft Edge TTS for Scene ${sceneIndex}...`);

  // Voice rotation pool: 3 male + 3 female high-quality English voices
  const VOICE_POOL = [
    'en-US-AndrewMultilingualNeural',  // Male, clear & professional
    'en-US-BrianMultilingualNeural',   // Male, warm & engaging
    'en-US-SteffanNeural',             // Male, energetic tech reviewer
    'en-US-AvaMultilingualNeural',     // Female, confident & modern
    'en-US-EmmaMultilingualNeural',    // Female, friendly & approachable
    'en-US-JennyNeural',              // Female, natural & conversational
  ];

  // Pick one random voice per video (use projectId as seed for consistency within same video)
  const voiceIndex = projectId.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % VOICE_POOL.length;
  const selectedVoice = VOICE_POOL[voiceIndex];

  try {
    console.log(`🎤 [TTS] Voice selected: ${selectedVoice}`);

    // Retry logic — Edge TTS free service often times out
    const MAX_RETRIES = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tts = new EdgeTTS({
          voice: selectedVoice,
          lang: 'en-US',
          outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
          saveSubtitles: true,
          rate: '+15%',
          pitch: '+2Hz'
        });

        await tts.ttsPromise(text, filePath);
        lastError = null;
        break; // Success — exit retry loop
      } catch (retryErr: unknown) {
        lastError = retryErr;
        const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 3000; // 3s, 6s backoff
          console.warn(`⚠️ [TTS] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}. Retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    if (lastError) {
      throw lastError; // All retries exhausted
    }

    // Chuyển đổi JSON sinh ra thành ASS cho FFmpeg đốt phụ đề
    // ASS format bakes positioning vào file header → subtitle luôn ở bottom
    const jsonSubPath = filePath + '.json';
    const vttPath = filePath.replace('.mp3', '.ass');
    convertEdgeJsonToAss(jsonSubPath, vttPath);

    // Đọc ffprobe để lấy chính xác duration
    const duration = await getMediaDuration(filePath); 
    
    console.log(`✅ [TTS Client] Render xong Edge-TTS Scene ${sceneIndex}. Duration: ${duration.toFixed(2)}s.`);

    return { filePath, vttPath, duration };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [TTS Client] Lỗi khi tạo Audio cho Scene ${sceneIndex} (after retries):`, errorMessage);
    throw error;
  }
}
