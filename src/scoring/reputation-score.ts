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
 * Previously the score was built from keys that expire: account age came from a key
 * with a 30-day TTL (so age saturated at 30 days and reset for anyone inactive a
 * month) and "total bets" came from a key with a 300-second TTL (so it really meant
 * "actions in the last five minutes"). The bot-flag key was read but never written by
 * any code path. The maximum reachable score was 65, which made ADVANCED (75) and
 * WHALE (90) unreachable by construction — and the resulting tier limits were never
 * consulted by checkPositionLimits anyway.
 *
 * The counters below are durable (no TTL) so the score reflects real history, and
 * checkPositionLimits now applies the tier limits this returns.
 */

export const TIERS = ['UNTRUSTED', 'BASIC', 'TRUSTED', 'ADVANCED', 'WHALE'] as const;
export type Tier = (typeof TIERS)[number];

/** Per-tier caps, in USDC at 6 decimals. */
export const TIER_LIMITS: Record<Tier, { maxBet: bigint; daily: bigint }> = {
  UNTRUSTED: { maxBet: 1_000_000n, daily: 5_000_000n },      //   1 /    5 USDC
  BASIC: { maxBet: 5_000_000n, daily: 50_000_000n },         //   5 /   50 USDC
  TRUSTED: { maxBet: 10_000_000n, daily: 100_000_000n },     //  10 /  100 USDC
  ADVANCED: { maxBet: 50_000_000n, daily: 500_000_000n },    //  50 /  500 USDC
  WHALE: { maxBet: 100_000_000n, daily: 1_000_000_000n },    // 100 / 1000 USDC
};

export interface Reputation {
  address: string;
  reputationScore: number;
  tier: Tier;
  metrics: {
    totalBets: number;
    winRate: number;
    accountAgeDays: number;
    flagCount: number;
  };
  limits: { maxBetSize: string; dailyLimit: string };
}

// Durable keys — deliberately no TTL, unlike the short-lived detection windows.
const kFirstSeen = (a: string) => `risk:profile:firstseen:${a}`;
const kBetCount = (a: string) => `risk:profile:bets:${a}`;
const kBotFlags = (a: string) => `risk:profile:botflags:${a}`;

/** Record durable profile history. Called on every allowed bet. */
export async function recordProfileActivity(address: string): Promise<void> {
  const pipeline = redis.pipeline();
  // SET NX: stamps first-seen once and never moves it.
  pipeline.set(kFirstSeen(address), Date.now().toString(), 'NX');
  pipeline.incr(kBetCount(address));
  await pipeline.exec();
}

/**
 * Record a bot-detection flag against an address.
 *
 * `risk:botflag:*` was previously read by the scorer but written by nothing, so
 * flagCount was permanently 0 and the "clean record" bonus was unconditional.
 */
export async function recordBotFlag(address: string): Promise<void> {
  await redis.incr(kBotFlags(address));
  logger.warn({ address }, 'Bot flag recorded against address');
}

export async function getUserReputation(address: string): Promise<Reputation> {
  const cacheKey = `risk:reputation:${address}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as Reputation;
    } catch {
      // fall through and recompute
    }
  }

  const [firstSeen, betCountRaw, botFlagsRaw] = await redis.mget(
    kFirstSeen(address),
    kBetCount(address),
    kBotFlags(address)
  );

  const now = Date.now();
  const accountAgeMs = firstSeen ? now - parseInt(firstSeen, 10) : 0;
  const accountAgeDays = Math.max(0, Math.floor(accountAgeMs / 86_400_000));
  const totalBets = parseInt(betCountRaw ?? '0', 10);
  const botFlags = parseInt(botFlagsRaw ?? '0', 10);

  // Age: 1 point/day up to 40 (≈6 weeks of history to max out).
  let score = Math.min(40, accountAgeDays);
  // Activity: 1 point per 2 bets, up to 40.
  score += Math.min(40, Math.floor(totalBets / 2));
  // Clean record: 20 points, lost at 10 per flag.
  score += botFlags === 0 ? 20 : Math.max(-20, 20 - botFlags * 10);

  score = Math.max(0, Math.min(100, score));

  let tier: Tier = 'UNTRUSTED';
  if (score >= 90) tier = 'WHALE';
  else if (score >= 75) tier = 'ADVANCED';
  else if (score >= 50) tier = 'TRUSTED';
  else if (score >= 30) tier = 'BASIC';

  const limits = TIER_LIMITS[tier];

  const result: Reputation = {
    address,
    reputationScore: score,
    tier,
    metrics: {
      totalBets,
      // Win rate needs settled-position data, which lives in the subgraph. Reported as
      // 0 until that is wired up rather than being invented.
      winRate: 0,
      accountAgeDays,
      flagCount: botFlags,
    },
    limits: {
      maxBetSize: limits.maxBet.toString(),
      dailyLimit: limits.daily.toString(),
    },
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
  return result;
}

/** Tier limits for a user, used by checkPositionLimits to actually enforce them. */
export async function getLimitsForUser(address: string): Promise<{ maxBet: bigint; daily: bigint; tier: Tier }> {
  const rep = await getUserReputation(address);
  return { ...TIER_LIMITS[rep.tier], tier: rep.tier };
}
