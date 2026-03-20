import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
};

async function main() {
    console.log('====================================================');
    console.log('🛑 [HUMAN-IN-THE-LOOP] BẢNG ĐIỀU KHIỂN DUYỆT KỊCH BẢN');
    console.log('====================================================\n');

    try {
        const { data: jobs, error } = await supabase
            .from('video_projects')
            .select('*')
            .eq('status', 'pending_approval')
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!jobs || jobs.length === 0) {
            console.log('✅ Hiện tại không có Job nào đang chờ duyệt (pending_approval).');
            rl.close();
            return;
        }

        console.log(`Tìm thấy ${jobs.length} Job đang chờ duyệt.\n`);

        for (const job of jobs) {
            console.log(`----------------------------------------------------`);
            console.log(`📌 Job ID: ${job.id}`);
            console.log(`🎯 Tên YouTube Series: ${job.script_json?.youtube_title || 'N/A'}`);
            console.log(`✍️  Mô tả: ${job.script_json?.youtube_description || 'N/A'}`);
            console.log(`\nNội dung Kịch Bản (Voiceover Tiếng Anh):`);
            
            const scenes = job.script_json?.scenes || [];
            scenes.forEach((scene: any) => {
                console.log(`  [Scene ${scene.scene_index}]: ${scene.narration}`);
            });
            console.log(`----------------------------------------------------\n`);

            let answered = false;
            while (!answered) {
                const answer = await question(`❓ Bạn có muốn duyệt kịch bản này để đưa vào render không? (Y/N): `);
                const choice = answer.trim().toUpperCase();

                if (choice === 'Y') {
                    await supabase.from('video_projects').update({ status: 'approved_for_synthesis' }).eq('id', job.id);
                    console.log(`✅ Đã phê duyệt Job: ${job.id} -> Chuyển sang cỗ máy Render (approved_for_synthesis).`);
                    answered = true;
                } else if (choice === 'N') {
                    await supabase.from('video_projects').update({ status: 'rejected' }).eq('id', job.id);
                    console.log(`❌ Đã từ chối (REJECTED) Job: ${job.id}.`);
                    answered = true;
                } else {
                    console.log(`Nhập sai lệnh. Vui lòng gõ Y hoặc N.`);
                }
            }
            console.log('\n');
        }

        console.log(`🎉 [XONG] Đã xử lý tất cả các Job trong hàng chờ.`);

    } catch (err) {
        console.error('Lỗi khi truy xuất Database:', err);
    } finally {
        rl.close();
    }
}

main();
