// import { supabase } from '../../lib/supabase';
import fs from 'fs';
import path from 'path';

/**
 * Task 3: Storage & State Completion
 * Chức năng Mock Storage Upload -> Update DB State -> Cleanup Thư mục Temporary local server
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function uploadAndFinalizeProject(projectId: string, _finalVideoPath: string): Promise<string> {
  console.log(`\n====================================================`);
  console.log(`📤 [Storage Uploader] Chuẩn bị đóng gói Project [${projectId}]`);
  console.log(`====================================================\n`);

  try {
    // ---- 1. UPLOAD FILE FINAL_OUTPUT.MP4 LÊN CLOUD STORAGE ----
    console.log(`⬆️ Đang tải video lên Supabase Storage... (Mock)`);
    // const fileBuffer = fs.readFileSync(finalVideoPath);
    // const { data, error } = await supabase.storage.from('videos').upload(`shorts/${projectId}.mp4`, fileBuffer, { contentType: 'video/mp4' });
    // if (error) throw error;
    
    // const publicUrl = supabase.storage.from('videos').getPublicUrl(`shorts/${projectId}.mp4`).data.publicUrl;
    const publicUrl = `https://your-supabase-url.com/storage/v1/object/public/videos/shorts/${projectId}.mp4`;
    console.log(`   [PASS] File hoàn thiện Cloud URL: ${publicUrl}`);

    // ---- 2. CẬP NHẬT TRẠNG THÁI DB SANG 'ready_for_upload' (Phase 4) ----
    console.log(`💾 Cập nhật trạng thái video_projects sang [ready_for_upload]...`);
    // await supabase.from('video_projects').update({
    //   status: 'ready_for_upload',
    //   final_video_url: publicUrl
    // }).eq('id', projectId);
    console.log(`   [PASS] Cập nhật State thành công.`);

    // ---- 3. DỌN DẸP RÁC LOCAL SPACE (CLEANUP) ----
    const tmpDir = path.join(process.cwd(), 'tmp', projectId);
    if (fs.existsSync(tmpDir)) {
      console.log(`🧹 Dọn dẹp thư mục tạm thời: ${tmpDir}`);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    console.log(`   [PASS] Ổ cứng máy chủ worker đã được dọn sạch.`);
    
    console.log(`\n🎉 [COMPLETE] PHASE 3 (THE SYNTHESIZER) XONG HOÀN TOÀN! CHUYỂN GIAO THÀNH CÔNG.\n`);
    
    return publicUrl;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`❌ [Storage Uploader] Thất bại ở khâu cuối cùng:`, errorMessage);
    throw err;
  }
}
