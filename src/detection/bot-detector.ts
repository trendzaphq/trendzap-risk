import { config } from '../config';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 3 });

/**
 * Bot detection heuristics — Polymarket-level anti-sybil.
 *
 * Signals analyzed:
 * 1. Action clustering: ≥5 bets within 30s = suspicious
 * 2. Uniform bet sizing: all bets exactly the same = scripted
 * 3. Account age < 1 hour + high activity = bot
 * 4. Sequential market targeting: same user across many markets in 5 min
 */
export async function checkBotActivity(userId: string): Promise<{
  passed: boolean;
  score: number;
  signals: string[];
}> {
  let score = 0;
  const signals: string[] = [];

  const now = Date.now();

  // Signal 1: Action clustering — count events in last 30s
  const recentKey = `risk:actions:${userId}`;
  const recentActions = await redis.zrangebyscore(recentKey, now - 30_000, now);
  if (recentActions.length >= 5) {
    score += 0.35;
    signals.push(`${recentActions.length} actions in 30s (clustering)`);
  }

  // Signal 2: Uniform bet sizing — last 10 bet amounts
  const betSizesKey = `risk:betsizes:${userId}`;
  const betSizes = await redis.lrange(betSizesKey, 0, 9);
  if (betSizes.length >= 5) {
    const unique = new Set(betSizes);
    if (unique.size === 1) {
      score += 0.25;
      signals.push('all recent bets are identical size (scripted)');
    }
  }

  // Signal 3: Account age + activity burst
  const firstSeenKey = `risk:firstseen:${userId}`;
  const firstSeen = await redis.get(firstSeenKey);
  if (firstSeen) {
    const ageMs = now - parseInt(firstSeen, 10);
    if (ageMs < 3_600_000 && recentActions.length >= 3) {
      score += 0.2;
      signals.push('new account with high activity burst');
    }
  } else {
    // First time we see this user — record it
    await redis.set(firstSeenKey, now.toString(), 'EX', 86400 * 30); // keep 30d
  }

  // Signal 4: Multi-market targeting in 5 min
  const marketKey = `risk:markets:${userId}`;
  const recentMarkets = await redis.smembers(marketKey);
  if (recentMarkets.length >= 8) {
    score += 0.2;
    signals.push(`${recentMarkets.length} different markets in window (carpet bombing)`);
  }

  score = Math.min(score, 1.0);

  if (signals.length > 0) {
    logger.debug({ userId, score, signals }, 'Bot detection signals');
  }

  return {
    passed: score < config.botScoreThreshold,
    score,
    signals,
  };
}

/**
 * Record an action for bot detection tracking.
 * Call this on every bet/claim to feed the heuristic windows.
 */
export async function recordAction(userId: string, marketId: string, amount: string): Promise<void> {
  const now = Date.now();
  const pipeline = redis.pipeline();

  // Track action timestamp (sorted set, auto-expire 5min)
  const actKey = `risk:actions:${userId}`;
  pipeline.zadd(actKey, now, `${now}`);
  pipeline.zremrangebyscore(actKey, 0, now - 300_000);
  pipeline.expire(actKey, 300);

  // Track bet sizing (list, keep last 20)
  const sizeKey = `risk:betsizes:${userId}`;
  pipeline.lpush(sizeKey, amount);
  pipeline.ltrim(sizeKey, 0, 19);
  pipeline.expire(sizeKey, 600);

  // Track market targeting (set, auto-expire 5min)
  const mktKey = `risk:markets:${userId}`;
  pipeline.sadd(mktKey, marketId);
  pipeline.expire(mktKey, 300);

  await pipeline.exec();
}
