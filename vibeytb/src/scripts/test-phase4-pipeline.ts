import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { uploadToYouTube } from '../agents/agent-4-publisher/youtube-uploader';

// Mô phỏng 1 Job lấy từ Supabase (bảng 'video_projects' có status = 'ready_for_upload')
const mockJob = {
  projectId: 'test-job-bypass-001',
  status: 'ready_for_upload',
  title: 'My Dummy Test Short - Tech Review #shorts',
  description: 'Đây là bài viết test luồng Playwright upload mà không dùng API Key giới hạn của YouTube Data V3. Mọi thứ tự động mô phỏng thao tác! #test',
  tags: ['automation', 'playwright', 'testing', 'shorts']
};

async function runPhase4Pipeline() {
  console.log('====================================================');
  console.log('🚀 [QA AUTOMATION] PHASE 4 (THE PUBLISHER) INTEGRATION TEST');
  console.log('====================================================\n');

  try {
    const finalVideoOutput = path.join(process.cwd(), 'tmp', mockJob.projectId, 'final_output.mp4');

    console.log(`🔍 [STEP 1] Đọc data Job từ Database (status='ready_for_upload')`);
    console.log(`   - Project ID: ${mockJob.projectId}`);
    console.log(`   - Title được biên tập: ${mockJob.title}`);

    // Dựng mock .mp4 trong trường hợp User chưa chạy test-phase3
    if (!fs.existsSync(finalVideoOutput)) {
      console.log(`\n⚠️ Không tìm thấy file gốc ở ${finalVideoOutput}.`);
      console.log(`⚠️ Đang tự động render file MOCK 1MB chứa hình tĩnh đen để Playwright đủ format upload...`);
      fs.mkdirSync(path.dirname(finalVideoOutput), { recursive: true });
      fs.writeFileSync(finalVideoOutput, Buffer.alloc(1024 * 50)); // Dummy bytes file -> YT Studio might reject if it's completely invalid structure
      
      // Chú ý: Vì YT Studio Validate file rất gắt gao. Nếu nó ko phải format mp4 thực,
      // Playwright sẽ tắc ở vòng tròn loading lúc click file. 
      // Về sau bạn nên dùng ffmpeg sinh file test hoặc trỏ thẳng vào file đã chạy ở Phase 3!
      console.log(`   [CẢNH BÁO MOCKU] File mp4 này là dạng Fake Buffer nên YouTube sẽ từ chối sau quá trình Upload Processed. Nếu có file thật từ Phase 3 hãy thay vào!`);
    }
    
    console.log(`\n🏭 [STEP 2] Kích hoạt Headless Uploader Playwright...`);
    // Ở chế độ test này, có thể set tham số isHeadless = false để dev nhìn mắt thường giao diện thao tác
    const youtubeUrl = await uploadToYouTube(
      mockJob.projectId,
      finalVideoOutput,
      mockJob.title,
      mockJob.description,
      mockJob.tags,
      false // chạy debug headful
    );

    console.log(`\n💾 [STEP 3] Database Integration & Cleanup Local Storage...`);
    console.log(`   [SQL Query] UPDATE video_projects SET status='published', youtube_url='${youtubeUrl}' WHERE id='${mockJob.projectId}';`);
    
    console.log(`   [File System] Đang xoá file cồng kềnh lấy lại bộ nhớ: ${finalVideoOutput}`);
    // fs.unlinkSync(finalVideoOutput); // Logic Code that cleans up
    console.log(`   [INFO] Đã bỏ qua (Skip) xóa file thật vì đang trong môi trường testing.`);

    console.log('\n====================================================');
    console.log(`✅ [PASS] PHASE 4 INTEGRATION COMPLETE`);
    console.log(`   YouTube Official Link: ${youtubeUrl}`);
    console.log('====================================================');

    process.exit(0);
  } catch (error) {
    console.log('\n====================================================');
    console.error('❌ [FAIL] PHASE 4 QUÁ TRÌNH PIPELINE ĐỨT GÃY!');
    console.error(error);
    console.log('====================================================');
    process.exit(1);
  }
}

runPhase4Pipeline();
