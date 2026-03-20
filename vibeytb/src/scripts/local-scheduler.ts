import 'dotenv/config';
import cron from 'node-cron';
import { TheMasterOrchestrator } from './the-orchestrator';

// Khởi tạo Orchestrator
const orchestrator = new TheMasterOrchestrator();

console.log('====================================================');
console.log('⏰ [LOCAL SCHEDULER] ĐÃ KHỞI ĐỘNG VÀ CHẠY NGẦM...');
console.log(' Mục tiêu: Tự động hóa Zero-Cost toàn tập ngay trên PC');
console.log(' Lịch trình: 09:00 Sáng và 19:00 Tối mỗi ngày.');
console.log(' Đang chờ đến giờ G để kích hoạt Hệ Thống...');
console.log('====================================================\n');

// Lên lịch chạy lúc 09:00 sáng mỗi ngày
cron.schedule('0 9 * * *', async () => {
    console.log(`\n🔔 [TRIGGER] Đã đến 09:00 Sáng - Bắt đầu quy trình làm video tự động!`);
    try {
        await orchestrator.runAutoPilot('all');
    } catch (error) {
        console.error('❌ Lỗi tiến trình tự động hóa (09:00):', error);
    }
});

// Lên lịch chạy lúc 19:00 tối (7h tối) mỗi ngày
cron.schedule('0 19 * * *', async () => {
    console.log(`\n🔔 [TRIGGER] Đã đến 19:00 Tối - Bắt đầu quy trình làm video tự động!`);
    try {
        await orchestrator.runAutoPilot('all');
    } catch (error) {
        console.error('❌ Lỗi tiến trình tự động hóa (19:00):', error);
    }
});

// Giữ cho process này không bị thoát
process.on('SIGINT', () => {
    console.log('Đóng Scheduler an toàn.');
    process.exit(0);
});
