import 'dotenv/config';
import { QueueName } from '../types/queue';
import { addJobToQueue } from '../lib/queue/producer';

async function runTestAgent2() {
  console.log('🤖 Bắt đầu Test Agent 2 (The Content Strategist)...');

  // Do ở script test producer trước đó ta đã inject 1 data mock hoặc có 1 dòng nào đó trong bảng trends.
  // Tuy nhiên, để test Agent 2 độc lập, ta cần 1 Project ID.
  // Do đó, ta sẽ Query lên CSDL để kiếm Project ID gần nhất đang trong state 'draft'
  const { supabase } = await import('../lib/supabase/client');
  const { data: projects, error } = await supabase
    .from('video_projects')
    .select('id, status')
    // Để dễ test, ta cứ bốc đại project nào cũng được, nhỡ đâu có dính từ cũ
    .limit(1);

  if (error || !projects || projects.length === 0) {
     console.error('❌ Không tìm thấy Project nào trong DB. Hãy chạy `npx tsx src/scripts/test-phase1-flow.ts` hoặc test-worker trước để mồi DB.');
     process.exit(1);
  }

  const projectId = projects[0].id;
  console.log(`📌 Found Project ID để test: ${projectId}`);

  // Đẩy Job vào hàng đợi AI
  await addJobToQueue(QueueName.AI_GENERATION, 'generate_script_test', { project_id: projectId });
  
  console.log('✅ Đã đẩy Job thành công vào Hàng Đợi AI_GENERATION!');
  console.log('⏳ Bạn cần chạy Worker Agent 2 ở một Terminal khác để đón lệnh nhé!');
}

runTestAgent2();
