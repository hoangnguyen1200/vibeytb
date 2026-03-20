import { Worker, Job } from 'bullmq';
import { generateAudioFromText } from './tts-client';
import { generateVideoFromPrompt } from './veo-client';

// Giả lập instance supabase client trong tương lai (có export từ lib/supabase)
// import { supabase } from '../../lib/supabase';

// Lấy kết nối Redis từ env hoặc mặc định local
const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

/**
 * Interface mô phỏng cấu trúc 1 Scene sau Phase 2 (Scripting)
 */
interface SceneData {
  scene_index: number;
  narration: string;
  visual_prompt: string;
}

/**
 * Mẫu dữ liệu đầu vào cho Job sinh Video
 */
interface SynthesisJobData {
  project_id: string; // ID của video_projects trong Supabase
  scenes: SceneData[];
}

/**
 * Khởi tạo Worker Phase 3: Hệ thống tổng hợp Media (The Synthesizer)
 */
export const producerWorker = new Worker<SynthesisJobData>(
  'phase3-synthesis-queue',
  async (job: Job<SynthesisJobData>) => {
    const { project_id, scenes } = job.data;
    console.log(`\n====================================================`);
    console.log(`🏭 [Phase 3 Worker] Chạm tới Job Hợp nhất Video: Project [${project_id}]`);
    console.log(`====================================================\n`);

    try {
      // BƯỚC 1: Lặp và Render từng Scene với cơ chế Predictable State Saving
      for (const scene of scenes) {
        // --- GIẢ LẬP STATE CHECK VỚI SUPABASE ---
        // let { data: existingAudio } = await supabase.from('rendered_assets')
        //   .select('status, file_url, duration_sec').eq('project_id', project_id).eq('scene_index', scene.scene_index).eq('asset_type', 'audio').single();
        // let { data: existingVideo } = await supabase.from('rendered_assets')
        //   .select('status, file_url').eq('project_id', project_id).eq('scene_index', scene.scene_index).eq('asset_type', 'video').single();

        let audioDuration = 0; // Để truyền cho Veo API độ dài bằng nhau
        
        let audioDone = false; // Mock data check
        let videoDone = false; // Mock data check

        if (audioDone && videoDone) {
           console.log(`⏭️ [Skip] Scene ${scene.scene_index} ĐÃ ĐƯỢC RENDER (status='done'). Bỏ qua...`);
           continue;
        }

        // --- RENDER AUDIO TRƯỚC (BẮT BUỘC ĐỂ LẤY DURATION CHO VIDEO) ---
        if (!audioDone) {
          console.log(`🎙️ [Tiến trình] Bắt đầu Render Audio Scene ${scene.scene_index}...`);
          // Cập nhật Database -> processing
          // await supabase.from('rendered_assets').insert({ project_id, scene_index: scene.scene_index, asset_type: 'audio', status: 'processing' });

          const audioResult = await generateAudioFromText(scene.narration, project_id, scene.scene_index);
          audioDuration = audioResult.duration;
          
          // Audio hoàn thành -> lưu vào Database
          // await supabase.from('rendered_assets').update({ file_url: audioResult.filePath, duration_sec: audioResult.duration, status: 'done' }).eq('project_id', project_id).eq('scene_index', scene.scene_index).eq('asset_type', 'audio');
        } else {
             // audioDuration = existingAudio.duration_sec;
        }

        // --- RENDER VIDEO DỰA TRÊN DURATION CỦA AUDIO ---
        if (!videoDone) {
          console.log(`🎬 [Tiến trình] Bắt đầu Render Video Scene ${scene.scene_index} (Duration: ${audioDuration.toFixed(2)}s)...`);
          // Cập nhật Database -> processing
          // await supabase.from('rendered_assets').insert({ project_id, scene_index: scene.scene_index, asset_type: 'video', status: 'processing' });

          const videoUrl = await generateVideoFromPrompt(scene.visual_prompt, audioDuration, project_id, scene.scene_index);
          
          // Video hoàn thành -> lưu vào Database
          // await supabase.from('rendered_assets').update({ file_url: videoUrl, duration_sec: Math.ceil(audioDuration), status: 'done' }).eq('project_id', project_id).eq('scene_index', scene.scene_index).eq('asset_type', 'video');
        }

        console.log(`✅ [Worker] Scene ${scene.scene_index} Media Assets hoàn tất!\n`);
      }

      console.log(`🎯 [Phase 3 Worker] TẤT CẢ ASSETS TRONG PROJECT [${project_id}] ĐÃ SẴN SÀNG CHO STITCHING.\n`);
      // Sau khi Worker kết thúc mà ko bị Throw Error nào, ta có thể spawn thêm job nối file
      // hoặc trigger trực tiếp `media-stitcher.ts` tại đây!

    } catch (error: any) {
      if (error.message === 'RATE_LIMIT') {
         // Nếu quăng exception thẳng ra ngoài, BullMQ sẽ tự động trigger delay lại
         throw new Error('Đụng Rate Limit. Tạm hoãn process để BullMQ Backoff...');
      }
      console.error(`❌ [Phase 3 Worker] Fatal Error:`, error.message);
      // await supabase.from('video_projects').update({ error_logs: error.message }).eq('id', project_id);
      throw error; // Kích hoạt retry
    }
  },
  {
    connection,
    concurrency: 1, // API Media rất nặng và Rate-limit dễ gặp -> Chỉ chạy 1 job đồng thời!
    lockDuration: 300000 // Cấp lock 5 phút mỗi job tránh bị giành quyền
  }
);
