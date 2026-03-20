import 'dotenv/config';
import { supabase } from '../lib/supabase/client';
import { generateScriptFromTrend } from '../agents/agent-2-strategist/generator';

// Giả lập Dữ liệu Đầu vào từ Phase 1
const mockTrend = "AI thay thế lập trình viên 2026";

async function runMockPipeline() {
  console.log('🔄 BẮT ĐẦU MOCK PIPELINE TEST (PHASE 1 -> PHASE 2)\n');
  
  try {
    // 1. Giả lập Project trong DB
    console.log('1️⃣ Tạo Mock Project "draft"...');
    const { data: trendData, error: tErr } = await supabase
      .from('trends')
      .insert({ keyword: mockTrend, source: 'google_trends' })
      .select('id').single();
      
    if (tErr) throw new Error(`Lỗi tạo giả Trends: ${tErr.message}`);

    const { data: projectData, error: pErr } = await supabase
      .from('video_projects')
      .insert({ trend_id: trendData.id, status: 'draft' })
      .select('id, status').single();
      
    if (pErr) throw new Error(`Lỗi tạo giả Project: ${pErr.message}`);
    
    const projectId = projectData.id;
    console.log(`✅ Đã tạo Mock Project ID: ${projectId} (Status: ${projectData.status})\n`);

    // 2. Chạy Logic Phase 2 (LLM call)
    console.log(`2️⃣ Kích hoạt Phase 2: Gọi Gemini sinh kịch bản cho từ khoá "${mockTrend}"...`);
    // Ở đây ta gọi hàm trực tiếp để Bypass Queue, focus test Data Pipeline & Schema Handoff
    const aiOutput = await generateScriptFromTrend(mockTrend);
    
    console.log('✅ Kịch bản AI trả về thành công và đã pass qua Zod Schema Validator!');
    console.log('📦 PREVIEW HỢP ĐỒNG DỮ LIỆU (JSON HAND-OFF CHO PHASE 3):');
    console.log(JSON.stringify(aiOutput, null, 2));
    
    // 3. Giả lập lại Flow Ghi DB An toàn của Worker
    console.log('\n3️⃣ Kiểm tra tính toàn vẹn State Management khi ghi CSDL...');
    
    const { error: scriptErr } = await supabase
      .from('video_scripts')
      .upsert({ project_id: projectId, scenes: aiOutput.scenes }, { onConflict: 'project_id' });
      
    if (scriptErr) throw new Error(`Lỗi ghi Scripts: ${scriptErr.message}`);
    console.log('✅ Đã lưu xong cấu trúc Scenes vào bảng `video_scripts`.');

    const { error: updateErr } = await supabase
      .from('video_projects')
      .update({
         title: aiOutput.youtube_title,
         youtube_description: aiOutput.youtube_description,
         youtube_tags: aiOutput.youtube_tags,
         status: 'script_ready' // Chuyển state
      })
      .eq('id', projectId);
      
    if (updateErr) throw new Error(`Lỗi chuyển Status: ${updateErr.message}`);
    console.log('✅ Đã chuyển trạng thái Project thành `script_ready` an toàn.\n');
    
    console.log('🎉 TOÀN BỘ MOCK PIPELINE HOẠT ĐỘNG HOÀN HẢO!');
  } catch (error: unknown) {
    console.error(`\n❌ MOCK PIPELINE THẤT BẠI: ${error instanceof Error ? error.message : String(error)}`);
  }
}

runMockPipeline();
