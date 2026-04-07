import IORedis from 'ioredis';
import { config } from '../config';

const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 3 });

/**
 * Velocity-based rate limiter.
 * Tracks actions-per-minute using Redis sliding window (sorted set).
 * Max rate is configurable per-user tier (default: 10/min).
 */
export async function checkVelocity(userId: string): Promise<{
  passed: boolean;
  rate: number;
  maxRate: number;
}> {
  const maxRate = 10; // actions per minute
  const now = Date.now();
  const windowMs = 60_000;
  const key = `risk:velocity:${userId}`;

  // Count events in the last 60s
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - windowMs);
  pipeline.zcard(key);
  const results = await pipeline.exec();

  const rate = (results?.[1]?.[1] as number) ?? 0;

  return {
    passed: rate <= maxRate,
    rate,
    maxRate,
  };
}

/**
 * Record an action for velocity tracking.
 */
export async function recordVelocityEvent(userId: string): Promise<void> {
  const now = Date.now();
  const key = `risk:velocity:${userId}`;
  await redis.pipeline()
    .zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`)
    .expire(key, 120)
    .exec();
}
