import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// Phase 1 Imports
import { scrapeGoogleTrendsRSS } from '../agents/agent-1-data-miner/scraper';
// Phase 2 Imports
import { generateScriptFromTrend } from '../agents/agent-2-strategist/generator';
// Phase 3 Imports
import { generateAudioFromText } from '../agents/agent-3-producer/tts-client';
import { downloadStockVideo } from '../agents/agent-3-producer/pexels-client';
import { downloadBGMFromPixabay } from '../agents/agent-3-producer/pixabay-client';
import { recordWebsiteScroll } from '../agents/agent-3-producer/playwright-recorder';
import { mergeAudioVideoScene, concatScenes } from '../agents/agent-3-producer/media-stitcher';

async function runZeroCostPipeline() {
  console.log('====================================================');
  console.log('🚀 [DRY-RUN] INITIALIZING ZERO-COST PIPELINE TEST (Pexels + Edge-TTS)');
  console.log('====================================================\n');

  try {
    const jobId = `test_0_cost_${Date.now()}`;
    const targetRegion = 'US';
    const targetLanguage = 'en-US';
    const toneOfVoice = 'tech review, engaging';

    // ==========================================
    // PHASE 1: DATA MINING
    // ==========================================
    console.log(`\n🦀 [PHASE 1] Data Mining (Cào dữ liệu Trending)...`);
    const trends = await scrapeGoogleTrendsRSS(targetRegion);
    if (!trends || trends.length === 0) throw new Error("Phase 1: Không tìm thấy trend nào từ Google RSS!");
    
    // Test lấy trend top 1
    const selectedTrend = trends[0].title;
    console.log(`   => Đã khóa mục tiêu từ khóa: "${selectedTrend}"`);

    // ==========================================
    // PHASE 2: SCRIPTING
    // ==========================================
    console.log(`\n🧠 [PHASE 2] Content Strategist (Sinh kịch bản bằng AI)...`);
    const aiOutput = await generateScriptFromTrend(selectedTrend, targetLanguage, toneOfVoice);
    console.log(`   => Kịch bản đã được thiết kế: "${aiOutput.youtube_title}" với ${aiOutput.scenes.length} phân cảnh.\n`);

    // ==========================================
    // PHASE 3: THE SYNTHESIZER
    // ==========================================
    console.log(`\n🎬 [PHASE 3] The Synthesizer (Chế tạo Media - Edge TTS & Pexels)`);
    const tmpDir = path.join(process.cwd(), 'tmp', jobId);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const finalSceneFiles: string[] = [];

    for (const scene of aiOutput.scenes) {
        console.log(`\n   --- Đang xử lý SCENE ${scene.scene_index} ---`);
        const sceneFinalPath = path.join(tmpDir, `scene_${scene.scene_index}_final.mp4`);
        
        console.log(`   🎙️ Sinh Voice AI (Edge-TTS)...`);
        const { filePath: audioPath, vttPath, duration } = await generateAudioFromText(scene.narration, jobId, scene.scene_index);
        
        console.log(`\n🎬 [SCENE ${scene.scene_index}] (Khoảng ${scene.estimated_duration}s)`);
        console.log(`   - 📖 Lời bình: "${scene.narration}"`);
        console.log(`   - 🎥 Keyword B-Roll (Pexels): [${scene.stock_search_keywords || 'tech'}]`);
        
        let videoPath: string;
        if (scene.target_website_url) {
            console.log(`   📹 Mở Playwright ghi hình trang web: ${scene.target_website_url}...`);
            videoPath = await recordWebsiteScroll(scene.target_website_url, duration, path.join(tmpDir, `scene_${scene.scene_index}_raw.webm`), scene.target_search_query || undefined);
        } else {
            console.log(`   🎥 Tải tự động Stock Video Pexels (từ khóa: "${scene.stock_search_keywords || "tech"}")...`);
            videoPath = await downloadStockVideo(scene.stock_search_keywords || "tech", jobId, scene.scene_index);
        }
        
        console.log(`   ✂️ Cắt ghép Normalize âm thanh & Hình ảnh (Tự động lặp lại video và ngắt đúng ${duration.toFixed(1)}s)...`);
        await mergeAudioVideoScene(videoPath, audioPath, sceneFinalPath, duration, vttPath);
        
        finalSceneFiles.push(sceneFinalPath);
    }

    // Nối tất cả các Scene thành 1 Master MP4 Final
    const finalVideoOutput = path.join(process.cwd(), 'tmp', jobId, 'final_output.mp4');
    
    console.log(`\n   🎧 Đang lấy nhạc nền (BGM) dựa trên cảm xúc "${aiOutput.music_mood}"...`);
    const bgmPath = await downloadBGMFromPixabay(aiOutput.music_mood, jobId);

    console.log(`\n   🎞️ Bắt đầu ghép (Concat) toàn bộ ${finalSceneFiles.length} phân cảnh thành Master MP4...`);
    await concatScenes(finalSceneFiles, finalVideoOutput, jobId, bgmPath);

    // Dừng lại trước ngưỡng cửa YouTube (Không chạy Phase 4)

    console.log('\n====================================================');
    console.log(`🎉 [THÀNH CÔNG] Pipeline 0 đồng chạy trót lọt đến trước ngưỡng cửa YouTube!`);
    console.log(`📁 File Video Hoàn Chỉnh (E2E Dry-run) đã được tổng hợp xong.`);
    console.log(`   ▶️  Hãy mở để xem thành quả: ${finalVideoOutput}`);
    console.log('====================================================');

  } catch (error) {
    console.error('\n❌ [TEST FAILED] Có lỗi xảy ra trong quá trình Dry-run:');
    console.error(error);
  }
}

runZeroCostPipeline();
