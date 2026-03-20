import { Queue } from 'bullmq';
import { redisConnection } from './redis';
import { QueueName } from '../../types/queue';

export const queues = {
  [QueueName.TREND_PROCESSOR]: new Queue(QueueName.TREND_PROCESSOR, { connection: redisConnection }),
  [QueueName.AI_GENERATION]: new Queue(QueueName.AI_GENERATION, { connection: redisConnection }),
  [QueueName.PUBLISH]: new Queue(QueueName.PUBLISH, { connection: redisConnection }),
};

// Hàm tiện ích thêm job
export const addJobToQueue = async (queueName: QueueName, jobName: string, data: unknown) => {
  const queue = queues[queueName];
  if (!queue) throw new Error(`Queue ${queueName} không được hỗ trợ`);
  
  // Các jobs liên quan API (AI, YouTube) cấu hình retry tự động để chống rate limit (Robust)
  return await queue.add(jobName, data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Thử lại sau 5s, 25s, 125s
    },
    removeOnComplete: true,
  });
};
