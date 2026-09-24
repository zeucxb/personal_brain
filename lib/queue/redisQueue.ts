import getRedisClient from '@/lib/redis';

export type BatchJobItem = {
  filename: string;
  materia: string;
  size: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  pages?: number;
  chunks?: number;
  error?: string;
  updatedAt: number;
};

export async function recordBatchFileStatus(
  batchId: string,
  filename: string,
  data: Partial<BatchJobItem>
) {
  try {
    const redis = getRedisClient();
    const existingRaw = await redis.hget(`batch:${batchId}`, filename);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const updated = {
      ...existing,
      ...data,
      filename,
      updatedAt: Date.now(),
    };
    await redis.hset(`batch:${batchId}`, filename, JSON.stringify(updated));
    await redis.expire(`batch:${batchId}`, 86400 * 3); // 3 dias de retenção
    return updated;
  } catch (err: any) {
    console.warn('Notice: Redis batch logging fallback:', err.message);
    return null;
  }
}

export async function getBatchStatus(batchId: string) {
  try {
    const redis = getRedisClient();
    const all = await redis.hgetall(`batch:${batchId}`);
    const files: BatchJobItem[] = Object.values(all).map((val) => JSON.parse(val));
    const total = files.length;
    const completed = files.filter((f) => f.status === 'completed').length;
    const failed = files.filter((f) => f.status === 'failed').length;
    return {
      batchId,
      total,
      completed,
      failed,
      inProgress: files.filter((f) => f.status === 'processing').length,
      files,
    };
  } catch (err: any) {
    return null;
  }
}
