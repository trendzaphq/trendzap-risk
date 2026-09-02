import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getLimitsForUser } from '../scoring/reputation-score';

const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 3 });

/**
 * Position limits — prevent concentration risk. Amounts are USDC at 6 decimals.
 *
 * Rules:
 * 1. Single bet cannot exceed the user's tier maxBet
 * 2. User's total daily volume cannot exceed the user's tier dailyLimit
 * 3. Bets below the dust minimum are rejected
 *
 * The per-tier limits from reputation-score.ts are now actually applied. They used to
 * be computed, cached, returned over the API, and then ignored here in favour of the
 * global config defaults — so a WHALE and a brand-new account were treated identically.
 */
export async function checkPositionLimits(
  userId: string,
  marketId: string,
  amount: bigint
): Promise<{
  passed: boolean;
  current: bigint;
  max: bigint;
  tier?: string;
  reason?: string;
}> {
  // Tier limits, falling back to the global defaults if reputation is unavailable.
  let maxPosition = config.defaultMaxBetSize;
  let dailyLimit = config.defaultDailyLimit;
  let tier: string | undefined;
  try {
    const limits = await getLimitsForUser(userId);
    maxPosition = limits.maxBet;
    dailyLimit = limits.daily;
    tier = limits.tier;
  } catch (err) {
    logger.warn(
      { userId, err: (err as Error).message },
      'Reputation lookup failed — falling back to default limits',
    );
  }

  // Check single bet size
  if (amount > maxPosition) {
    return {
      passed: false,
      current: amount,
      max: maxPosition,
      tier,
      reason: `Bet size ${amount} exceeds the ${tier ?? 'default'} tier maximum of ${maxPosition}`,
    };
  }

  // Check minimum bet (prevent dust attacks)
  const MIN_BET = BigInt('50000'); // 0.05 USDC (6 decimals)
  if (amount < MIN_BET) {
    return {
      passed: false,
      current: amount,
      max: maxPosition,
      tier,
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
      tier,
      reason: `Daily volume ${currentDaily + amount} would exceed the ${tier ?? 'default'} tier limit of ${dailyLimit}`,
    };
  }

  return {
    passed: true,
    current: currentDaily,
    max: dailyLimit,
    tier,
  };
}

/**
 * Increment the user's daily USDC volume after a bet is confirmed.
 * Key expires at midnight + 1h buffer.
 */
export async function recordDailyVolume(userId: string, amount: bigint): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const dailyKey = `risk:daily:vol:${userId}:${today}`;
  // INCRBY takes the amount as a string so a large bigint is not narrowed through a
  // double. Safe at 6-decimal USDC magnitudes today, but not if 18-decimal native
  // AVAX settlement is ever enabled.
  await redis.pipeline()
    .incrby(dailyKey, amount.toString())
    .expire(dailyKey, 90_000) // 25h expiry
    .exec();
}
