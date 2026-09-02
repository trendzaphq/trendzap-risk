import { checkPositionLimits, recordDailyVolume } from '../limits/position-limits';
import { checkBotActivity, recordAction } from './bot-detector';
import { checkVelocity, recordVelocityEvent } from './velocity-monitor';
import { recordProfileActivity, recordBotFlag } from '../scoring/reputation-score';
import { logger } from '../utils/logger';

export interface AssessmentRequest {
  type: 'bet' | 'market_create' | 'claim';
  marketId?: string;
  userId: string;
  outcome?: 'OVER' | 'UNDER';
  amount?: string;
}

export interface AssessmentResult {
  allowed: boolean;
  riskScore: number;
  checks: Record<string, { passed: boolean; [key: string]: any }>;
  warnings: string[];
}

/** riskScore at or above this blocks the action. */
const BLOCK_THRESHOLD = 0.7;

/**
 * Assess an action for manipulation risk.
 *
 * Note on scope: this is an off-chain advisory check. ViralityMarketV2 has no hook
 * into it, so a trader who calls the contract directly is never assessed. Treat the
 * result as a signal for the UI and for monitoring, not as an enforced limit —
 * enforceable caps belong in the contract.
 *
 * Scoring note: a position-limit breach used to score 0.5 against a 0.7 threshold, so
 * exceeding the maximum bet size never blocked on its own — it needed a second signal.
 * A hard limit breach is now decisive by itself.
 */
export async function assessRisk(request: AssessmentRequest): Promise<AssessmentResult> {
  const warnings: string[] = [];
  const checks: Record<string, { passed: boolean; [key: string]: any }> = {};
  let riskScore = 0;

  // Position limits — a hard cap, so a breach is decisive on its own.
  if (request.type === 'bet') {
    if (!request.amount || !/^\d+$/.test(request.amount)) {
      return {
        allowed: false,
        riskScore: 1,
        checks: { positionLimit: { passed: false, reason: 'amount is required for a bet' } },
        warnings: ['A numeric amount is required for bet assessments'],
      };
    }

    const positionCheck = await checkPositionLimits(
      request.userId,
      request.marketId ?? 'unknown',
      BigInt(request.amount)
    );
    checks.positionLimit = positionCheck;
    if (!positionCheck.passed) {
      riskScore += BLOCK_THRESHOLD; // decisive
      warnings.push(positionCheck.reason ?? 'Position limit exceeded');
    }
  }

  const botCheck = await checkBotActivity(request.userId);
  checks.botActivity = botCheck;
  if (!botCheck.passed) {
    riskScore += 0.45;
    warnings.push('Potential bot activity detected');
    // Persist the flag so it feeds the durable reputation score. This was previously
    // read by the scorer but never written by anything.
    await recordBotFlag(request.userId).catch(() => {});
  }

  const velocityCheck = await checkVelocity(request.userId);
  checks.velocity = velocityCheck;
  if (!velocityCheck.passed) {
    riskScore += 0.3;
    warnings.push('Unusual activity velocity');
  }

  // Bot + velocity together (0.75) now also blocks; previously they summed to exactly
  // 0.5 and passed.
  const allowed = riskScore < BLOCK_THRESHOLD;

  if (allowed && request.type === 'bet') {
    const marketId = request.marketId ?? 'unknown';
    const amount = request.amount ?? '0';
    await Promise.all([
      recordAction(request.userId, marketId, amount),
      recordVelocityEvent(request.userId),
      recordDailyVolume(request.userId, BigInt(amount)),
      recordProfileActivity(request.userId),
    ]);
  } else if (allowed) {
    // claim / market_create still count towards velocity
    await recordVelocityEvent(request.userId);
  }

  logger.info({ request, allowed, riskScore }, 'Risk assessment complete');

  return { allowed, riskScore: Math.min(1, riskScore), checks, warnings };
}
