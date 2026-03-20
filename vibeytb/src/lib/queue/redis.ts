import { Redis } from 'ioredis';

let redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
if (redisUrl.includes('upstash.io') && redisUrl.startsWith('redis://')) {
  redisUrl = redisUrl.replace('redis://', 'rediss://');
}
// Tạo pool kết nối Redis
export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Bắt buộc null với BullMQ
  enableReadyCheck: false,
  tls: (redisUrl.startsWith('rediss://') || redisUrl.includes('upstash.io')) ? { rejectUnauthorized: false } : undefined,
});

redisConnection.on('error', (err) => {
  console.error('Redis connection error:', err);
});
