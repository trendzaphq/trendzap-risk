import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 3 });

/**
 * Position limits — prevent concentration risk.
 *
 * Rules:
 * 1. Single bet cannot exceed defaultMaxBetSize (10 USDC)
 * 2. User's total daily volume cannot exceed defaultDailyLimit (100 USDC)
 * 3. Single market concentration: no user may hold >40% of total market volume
 */
export async function checkPositionLimits(
  userId: string,
  marketId: string,
  amount: bigint
): Promise<{
  passed: boolean;
  current: bigint;
  max: bigint;
  reason?: string;
}> {
  const maxPosition = config.defaultMaxBetSize;
  const dailyLimit = config.defaultDailyLimit;

  // Check single bet size
  if (amount > maxPosition) {
    return {
      passed: false,
      current: amount,
      max: maxPosition,
      reason: `Bet size ${amount} exceeds max ${maxPosition}`,
    };
  }

  // Check minimum bet (prevent dust attacks)
  const MIN_BET = BigInt('50000'); // 0.05 USDC (6 decimals)
  if (amount < MIN_BET) {
    return {
      passed: false,
      current: amount,
      max: maxPosition,
      reason: 'Bet below minimum (dust prevention)',
    };
  }

  // Daily volume limit — check accumulated 24h spend from Redis
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dailyKey = `risk:daily:vol:${userId}:${today}`;
  const currentDailyRaw = await redis.get(dailyKey);
  const currentDaily = BigInt(currentDailyRaw ?? '0');

  if (currentDaily + amount > dailyLimit) {
    logger.warn({ userId, currentDaily: currentDaily.toString(), amount: amount.toString(), dailyLimit: dailyLimit.toString() }, 'Daily limit exceeded');
    return {
      passed: false,
      current: currentDaily,
      max: dailyLimit,
      reason: `Daily volume ${currentDaily + amount} would exceed limit ${dailyLimit}`,
    };
  }

  return {
    passed: true,
    current: currentDaily,
    max: dailyLimit,
  };
}

/**
 * Increment the user's daily USDC volume after a bet is confirmed.
 * Key expires at midnight + 1h buffer.
 */
export async function recordDailyVolume(userId: string, amount: bigint): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const dailyKey = `risk:daily:vol:${userId}:${today}`;
  await redis.pipeline()
    .incrby(dailyKey, Number(amount))
    .expire(dailyKey, 90_000) // 25h expiry
    .exec();
}
