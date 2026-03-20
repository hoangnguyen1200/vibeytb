import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { generateAudioFromText } from '../agents/agent-3-producer/tts-client';
import { generateVideoFromPrompt } from '../agents/agent-3-producer/veo-client';
import { mergeAudioVideoScene, concatScenes } from '../agents/agent-3-producer/media-stitcher';

// Bảng Database MOCK (Mô phỏng cơ chế Fault Tolerance)
const mockDatabase: Record<number, { audio: boolean, video: boolean }> = {
  1: { audio: true, video: true }, // Scene 1 giả lập ĐÃ CÓ (Fault Tolerance sẽ skip)
  2: { audio: false, video: false },
  3: { audio: false, video: false }
};

async function runPhase3PipelineLocal() {
  console.log('====================================================');
  console.log('🎬 [QA AUTOMATION] PHASE 3 (THE SYNTHESIZER) INTEGRATION TEST');
  console.log('====================================================\n');

  try {
    // 1. Khởi tạo Mock Job
    const projectId = 'test-job-001';
    const mockScenes = [
      { scene_index: 1, narration: "Testing scene one", visual_prompt: "Red square blinking" },
      { scene_index: 2, narration: "Testing scene two", visual_prompt: "Blue circle rotating" },
      { scene_index: 3, narration: "Testing scene three", visual_prompt: "Green triangle floating" },
    ];
    
    console.log(`🔍 [STEP 1] Nhận Mock Job với ${mockScenes.length} tập phân cảnh. Trạng thái: 'ready_for_synthesis'\n`);

    const finalSceneFiles: string[] = [];
    const tmpDir = path.join(process.cwd(), 'tmp', projectId);
    
    // Đảm bảo tạo thư mục giả định cho scene 1 (nếu đã xong)
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    if (mockDatabase[1].audio && mockDatabase[1].video) {
        // Tạo file dummy giả lập đã render sẵn trong ổ cứng cho Scene 1
        fs.writeFileSync(path.join(tmpDir, `mock_scene_1_final_already_done.mp4`), Buffer.alloc(100)); // file giả
    }

    // 2. Kích hoạt Worker (Audio/Video Fetching Loop)
    console.log(`🏭 [STEP 2] Kích hoạt Worker sinh Media...\n`);
    for (const scene of mockScenes) {
       console.log(`--- Đang xử lý SCENE ${scene.scene_index} ---`);
       
       // Kiểm tra State
       const isDone = mockDatabase[scene.scene_index].audio && mockDatabase[scene.scene_index].video;
       const sceneFinalPath = path.join(tmpDir, `scene_${scene.scene_index}_final.mp4`);

       if (isDone) {
          console.log(`⏭️ [Skip] Cơ chế Fault Tolerance: Phát hiện Scene ${scene.scene_index} ĐÃ XONG từ trước trong database. Bỏ qua gọi API!`);
          // Ghi nhận file đã tồn tại vào mảng concat
          finalSceneFiles.push(path.join(tmpDir, `mock_scene_1_final_already_done.mp4`));
          continue;
       }

       // Chưa xong -> Call API (Dummy)
       console.log(`🎙️ [Task] Đang sinh Audio...`);
       const { filePath: audioPath, duration } = await generateAudioFromText(scene.narration, projectId, scene.scene_index);
       
       console.log(`🎬 [Task] Đang sinh Video (Độ dài: ${duration.toFixed(2)}s)...`);
       const videoPath = await generateVideoFromPrompt(scene.visual_prompt, duration, projectId, scene.scene_index);

       // Nối Audio và Video cho cảnh quay (Media Standardization)
       console.log(`✂️ [Task] Standardization & Stitching Audio/Video cho Scene ${scene.scene_index}...`);
       await mergeAudioVideoScene(videoPath, audioPath, sceneFinalPath);
       
       finalSceneFiles.push(sceneFinalPath);
       // Mô phỏng đã hoàn thành
       mockDatabase[scene.scene_index].audio = true;
       mockDatabase[scene.scene_index].video = true;
       console.log(`✅ [Database] Cập nhật status Scene ${scene.scene_index} = 'done'\n`);
    }

    // 3. Ghép TẤT CẢ các scenes
    console.log(`\n🎞️ [STEP 3] Bắt đầu ghép (Concat) toàn bộ ${finalSceneFiles.length} phân cảnh...`);
    // Lọc loại bỏ file buffer ảo ở Scene 1 ra vì ffpeg thực tế không thể đọc file dummy trống 100 bytes
    // Trong test case mock này, ta chỉ concat scene 2 và 3 để chứng minh quá trình nối thành công
    const validSceneFiles = finalSceneFiles.filter(f => !f.includes('mock_scene_1_final_already'));
    
    const finalVideoOutput = path.join(tmpDir, 'final_output.mp4');
    await concatScenes(validSceneFiles, finalVideoOutput, projectId);

    // 4. Storage & State Cleanup
    console.log(`\n🧹 [STEP 4] Dọn dẹp rác Temporary (Workspace Cleanup)...`);
    // fs.rmSync(tmpDir, { recursive: true, force: true });
    // => Lưu ý: Bỏ comment hàm xóa trong bài test để giữ file ra xem thử!
    console.log(`   [INFO] (Skip) Giữ nguyên thư mục "${tmpDir}" để User kiểm tra kết quả MP4.`);

    console.log('\n====================================================');
    console.log(`✅ [PASS] PHASE 3 INTEGRATION COMPLETE`);
    console.log(`   Đường dẫn tệp Final MP4: ${finalVideoOutput}`);
    console.log('====================================================');
    
    process.exit(0);

  } catch (error: any) {
    console.log('\n====================================================');
    console.error('❌ [FAIL] PHASE 3 INTEGRATION BROKEN!');
    console.error(error);
    console.log('====================================================');
    process.exit(1);
  }
}

runPhase3PipelineLocal();
