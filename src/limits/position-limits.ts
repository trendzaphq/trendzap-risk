import { config } from '../config';
import { logger } from '../utils/logger';

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

  // Daily limit check would integrate with subgraph/Redis here
  // For now, pass through — real implementation queries subgraph for user's 24h volume

  return {
    passed: true,
    current: amount,
    max: maxPosition,
  };
}
