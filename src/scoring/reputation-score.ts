import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 3 });

/**
 * User reputation scoring.
 *
 * Tiers:
 *   0–29  = UNTRUSTED  (new account, no history)
 *   30–49 = BASIC      (some activity, limited history)
 *   50–74 = TRUSTED    (consistent, positive history)
 *   75–89 = ADVANCED   (long history, high win rate, no flags)
 *   90+   = WHALE      (high volume, verified, clean record)
 *
 * Scores are cached in Redis for 5 minutes.
 */
export async function getUserReputation(address: string): Promise<{
  address: string;
  reputationScore: number;
  tier: 'UNTRUSTED' | 'BASIC' | 'TRUSTED' | 'ADVANCED' | 'WHALE';
  metrics: {
    totalBets: number;
    winRate: number;
    accountAgeDays: number;
    flagCount: number;
  };
  limits: {
    maxBetSize: string;
    dailyLimit: string;
  };
}> {
  // Check cache first
  const cacheKey = `risk:reputation:${address}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // In production, fetch from subgraph. Compute based on on-chain history.
  const firstSeenKey = `risk:firstseen:${address}`;
  const firstSeen = await redis.get(firstSeenKey);
  const now = Date.now();
  const accountAgeMs = firstSeen ? now - parseInt(firstSeen, 10) : 0;
  const accountAgeDays = Math.floor(accountAgeMs / 86_400_000);

  // Base score from account age
  let score = Math.min(30, accountAgeDays * 2);

  // Activity bonus (tracked via risk:actions count)
  const actKey = `risk:actions:${address}`;
  const totalActions = await redis.zcard(actKey);
  score += Math.min(20, totalActions * 2);

  // No bot flags bonus
  const botKey = `risk:botflag:${address}`;
  const botFlags = parseInt(await redis.get(botKey) || '0', 10);
  if (botFlags === 0) score += 15;
  else score -= botFlags * 10;

  score = Math.max(0, Math.min(100, score));

  let tier: 'UNTRUSTED' | 'BASIC' | 'TRUSTED' | 'ADVANCED' | 'WHALE' = 'UNTRUSTED';
  if (score >= 90) tier = 'WHALE';
  else if (score >= 75) tier = 'ADVANCED';
  else if (score >= 50) tier = 'TRUSTED';
  else if (score >= 30) tier = 'BASIC';

  // Tier-based limits — USDC 6 decimals (1 USDC = 1_000_000)
  const limitMap: Record<string, { maxBet: string; daily: string }> = {
    UNTRUSTED: { maxBet: '1000000',    daily: '5000000' },    //   1 /   5 USDC
    BASIC:     { maxBet: '5000000',    daily: '50000000' },   //   5 /  50 USDC
    TRUSTED:   { maxBet: '10000000',   daily: '100000000' },  //  10 / 100 USDC
    ADVANCED:  { maxBet: '50000000',   daily: '500000000' },  //  50 / 500 USDC
    WHALE:     { maxBet: '100000000',  daily: '1000000000' }, // 100 / 1000 USDC
  };
  const limits = limitMap[tier];

  const result = {
    address,
    reputationScore: score,
    tier,
    metrics: {
      totalBets: totalActions,
      winRate: 0, // Would come from subgraph
      accountAgeDays,
      flagCount: botFlags,
    },
    limits: {
      maxBetSize: limits.maxBet,
      dailyLimit: limits.daily,
    },
  };

  // Cache for 5 minutes
  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);

  return result;
}
