import 'dotenv/config';
// import { startAIStrategistWorker } from '../agents/agent-2-strategist/worker';
import { redisConnection } from '../lib/queue/redis';

async function runWorker() {
  console.log('🤖 Đang nạp .env và kích hoạt Agent 2 Worker (The Content Strategist)...');
  
  // Xác minh Redis
  try {
     await redisConnection.ping();
     console.log('✅ Đã verify kết nối Redis Upstash thành công!');
  } catch (e: unknown) {
     console.error('❌ Mất kết nối DB Queue. Kiểm tra lại REDIS_URL', e instanceof Error ? e.message : String(e));
     process.exit(1);
  }

  // Khởi chạy Worker (Module Removed)
  // startAIStrategistWorker();
}

runWorker();
