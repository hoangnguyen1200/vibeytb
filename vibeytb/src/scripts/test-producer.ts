import 'dotenv/config';
import { addJobToQueue } from '../lib/queue/producer';
import { QueueName } from '../types/queue';

async function testPush() {
  console.log('Đang đẩy Job giả lập vào Queue Trend Processor...');
  
  await addJobToQueue(QueueName.TREND_PROCESSOR, 'scrape-youtube', {
    source: 'youtube',
    keyword: 'faceless channel ideas 2026',
    test_mode: true
  });

  console.log('✅ Đã đẩy Job thành công!');
  process.exit(0);
}

testPush().catch(console.error);
