import { checkPositionLimits, recordDailyVolume } from '../limits/position-limits';
import { checkBotActivity, recordAction } from './bot-detector';
import { checkVelocity, recordVelocityEvent } from './velocity-monitor';
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

export async function assessRisk(request: AssessmentRequest): Promise<AssessmentResult> {
  const warnings: string[] = [];
  const checks: Record<string, { passed: boolean; [key: string]: any }> = {};
  let riskScore = 0;

  // Position limits check
  if (request.type === 'bet' && request.amount) {
    const positionCheck = await checkPositionLimits(
      request.userId,
      request.marketId!,
      BigInt(request.amount)
    );
    checks.positionLimit = positionCheck;
    if (!positionCheck.passed) {
      riskScore += 0.5;
      warnings.push('Position limit exceeded');
    }
  }

  // Bot activity check
  const botCheck = await checkBotActivity(request.userId);
  checks.botActivity = botCheck;
  if (!botCheck.passed) {
    riskScore += 0.3;
    warnings.push('Potential bot activity detected');
  }

  // Velocity check
  const velocityCheck = await checkVelocity(request.userId);
  checks.velocity = velocityCheck;
  if (!velocityCheck.passed) {
    riskScore += 0.2;
    warnings.push('Unusual activity velocity');
  }

  const allowed = riskScore < 0.7;

  // Record this action so future checks have real data to work with.
  // Only record for allowed bets (don't feed bot signals from blocked requests).
  if (allowed && request.type === 'bet') {
    const marketId = request.marketId ?? 'unknown';
    const amount = request.amount ?? '0';
    await Promise.all([
      recordAction(request.userId, marketId, amount),
      recordVelocityEvent(request.userId),
      recordDailyVolume(request.userId, BigInt(amount)),
    ]);
  } else if (allowed) {
    // claim / market_create still count towards velocity
    await Promise.all([
      recordVelocityEvent(request.userId),
    ]);
  }

  logger.info({ request, allowed, riskScore }, 'Risk assessment complete');

  return {
    allowed,
    riskScore,
    checks,
    warnings,
  };
}
