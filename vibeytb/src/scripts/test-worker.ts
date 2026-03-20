import 'dotenv/config';
import { startTrendWorker } from '../agents/agent-1-data-miner/worker';

async function testWorker() {
  console.log('Đang khởi động Agent 1 Worker Test...');
  startTrendWorker();
  
  // Giữ process chạy
  process.on('SIGINT', () => {
    console.log('Đang tắt Worker...');
    process.exit(0);
  });
}

testWorker().catch(console.error);
