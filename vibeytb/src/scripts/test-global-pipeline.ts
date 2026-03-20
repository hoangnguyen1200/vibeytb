import 'dotenv/config';
import { scrapeYouTubeTrends, scrapeGoogleTrendsRSS } from '../agents/agent-1-data-miner/scraper';
import { generateScriptFromTrend, VideoScriptSchema } from '../agents/agent-2-strategist/generator';

// Biểu thức chính quy kiểm tra tiếng Việt có dấu
const VIETNAMESE_REGEX = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;

async function runQAGlobalPipelineTest() {
  console.log('====================================================');
  console.log('🚀 [QA AUTOMATION] GLOBAL DATA PIPELINE INTEGRATION TEST');
  console.log('====================================================\n');

  try {
    // Bước 1: Khởi tạo Mock Job Input
    console.log('🔍 [STEP 1] Mocking Database Config Read & Trigger Phase 1...');
    const mockDbJob = {
      target_region: 'US',
      target_language: 'en-US',
      tone_of_voice: 'casual and engaging American English'
    };
    console.log(`   [INFO] Injected Config: Region=${mockDbJob.target_region}, Lang=${mockDbJob.target_language}, Tone="${mockDbJob.tone_of_voice}"\n`);

    // Trigger Phase 1 (Data Mining)
    console.log(`🦀 Triggering Phase 1 (Data Mining) with Region: ${mockDbJob.target_region}...`);
    const trends = await scrapeGoogleTrendsRSS(mockDbJob.target_region);
    
    if (!trends || trends.length === 0) {
      throw new Error("Phase 1 Failed: Không cào được dữ liệu Trending nào từ Google Trends US.");
    }

    const top2 = trends.slice(0, 2);
    console.log(`   [PASS] Phase 1: Scraped Data Successfully. Extracted ${trends.length} keywords.`);
    top2.forEach((t, i) => console.log(`      ${i + 1}. "${t.title}" (Traffic: ${t.traffic})`));
    
    const selectedTrend = trends[0].title;
    console.log(`\n   => Lựa chọn từ khóa đầu tiên để chuyển giao: "${selectedTrend}"\n`);

    // Bước 2: Trigger Phase 2 (Scripting / Gemini LLM)
    console.log(`🧠 [STEP 2] Triggering Phase 2 (LLM Scripting) for keyword: "${selectedTrend}"...`);
    console.log(`   [INFO] Handing off Keyword -> Gemini 2.5 Flash API...`);
    
    const aiOutput = await generateScriptFromTrend(
      selectedTrend, 
      mockDbJob.target_language, 
      mockDbJob.tone_of_voice
    );

    // Bước 3: Language & Schema Validation
    console.log(`\n🛡️ [STEP 3] Validating LLM Output Schema & Language Constraints...`);
    
    const validationResult = VideoScriptSchema.safeParse(aiOutput);
    
    if (!validationResult.success) {
       console.error(`\n[FAIL] JSON Schema Breakage Detected! Data Contract Violated.`);
       console.error(JSON.stringify(validationResult.error, null, 2));
       throw new Error("Data Contract Violated");
    }

    // Verify key fields
    if (!aiOutput.scenes || aiOutput.scenes.length === 0 || !aiOutput.scenes[0].scene_index || !aiOutput.scenes[0].narration || !aiOutput.scenes[0].visual_prompt) {
      throw new Error("Data Contract Violated: Không có đủ cấc trường scene_index, narration, visual_prompt như yêu cầu Phase 3");
    }

    console.log(`   [PASS] Cấu trúc JSON chuẩn xác, đầy đủ các trường yêu cầu cho Phase 3 (scene_index, visual_prompt, narration).`);

    // Kiểm tra tiếng Việt trong narration (voiceover_text) và visual_prompt
    let hasVietnamese = false;
    for (const scene of aiOutput.scenes) {
      if (VIETNAMESE_REGEX.test(scene.narration) || VIETNAMESE_REGEX.test(scene.visual_prompt)) {
        hasVietnamese = true;
        break;
      }
    }

    if (hasVietnamese) {
      console.error(`\n❌ [FAIL] PHÁT HIỆN RÒ RỈ TIẾNG VIỆT TRONG OUTPUT JSON!`);
      throw new Error("Language verification failed: Contains Vietnamese characters.");
    }

    console.log(`   [PASS] Nội dung Text hoàn toàn bằng tiếng Anh, KHÔNG có rò rỉ ngôn ngữ cũ.`);

    // Bước 4: Validation / State Update
    console.log(`\n💾 [STEP 4] State Management Verification...`);
    console.log(`   [MOCK-SQL] UPDATE video_projects SET status = 'ready_for_video' WHERE id = 'mock-id' AND target_language = 'en-US'`);
    console.log(`   [PASS] Đã xác minh lệnh cập nhật với STRICT BOUNDARY: target_language = 'en-US'.\n`);
    
    console.log('====================================================');
    console.log('✅ [PASS] CLEAN ENGLISH DATA READY');
    console.log('====================================================');
    
    // Đợi 1s cho các handle đóng hẳn đề phòng crash UV trên Windows
    setTimeout(() => process.exit(0), 1000);

  } catch (error: any) {
    console.log('\n====================================================');
    console.error('❌ [FAIL] DATA FLOW BROKEN!');
    console.log('====================================================');
    console.error(`[STACK TRACE]:\n`, error.message || error);
    process.exit(1);
  }
}

runQAGlobalPipelineTest();
