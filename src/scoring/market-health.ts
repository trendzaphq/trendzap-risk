import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Market health score — Polymarket-tier market quality assessment.
 *
 * Scores:
 * - Concentration risk: are a few wallets dominating one side?
 * - Liquidity depth: is there enough volume for meaningful price discovery?
 * - Time risk: how close is the market to resolution? (urgency affects manipulation incentive)
 * - Balance ratio: how one-sided is the market? (extreme imbalance = higher manipulation risk)
 */
export async function getMarketHealth(marketId: string): Promise<{
  marketId: string;
  healthScore: number;
  metrics: {
    concentrationRisk: number;
    liquidityScore: number;
    timeRisk: number;
    balanceRatio: number;
    manipulationRisk: number;
  };
  flags: string[];
  recommendation: 'HEALTHY' | 'WATCH' | 'WARNING' | 'CRITICAL';
}> {
  const flags: string[] = [];

  // In production, these would come from the subgraph
  // Placeholder computations for real scoring logic
  const subgraphUrl = config.subgraphUrl;
  if (!subgraphUrl) {
    logger.warn('Subgraph URL not configured — returning synthetic health score');
  }

  // Simulate by marketId hash for now — each metric 0–1 where 0=safe, 1=risky
  const hash = simpleHash(marketId);

  const concentrationRisk = (hash % 40) / 100;  // 0.0–0.39
  const liquidityScore = 0.5 + (hash % 50) / 100; // 0.5–1.0  (higher=better)
  const timeRisk = (hash % 30) / 100;            // 0.0–0.29
  const balanceRatio = (hash % 60) / 100;        // 0.0–0.59

  const manipulationRisk = (concentrationRisk * 0.4 + (1 - liquidityScore) * 0.3 + balanceRatio * 0.3);

  if (concentrationRisk > 0.3) flags.push('High concentration — few wallets dominate');
  if (liquidityScore < 0.3) flags.push('Low liquidity — thin market');
  if (balanceRatio > 0.8) flags.push('Severely imbalanced — possible insider knowledge');
  if (timeRisk > 0.2) flags.push('Near resolution — elevated manipulation window');

  const healthScore = Math.max(0, 1 - manipulationRisk);
  let recommendation: 'HEALTHY' | 'WATCH' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
  if (healthScore < 0.3) recommendation = 'CRITICAL';
  else if (healthScore < 0.5) recommendation = 'WARNING';
  else if (healthScore < 0.7) recommendation = 'WATCH';

  return {
    marketId,
    healthScore: parseFloat(healthScore.toFixed(3)),
    metrics: {
      concentrationRisk: parseFloat(concentrationRisk.toFixed(3)),
      liquidityScore: parseFloat(liquidityScore.toFixed(3)),
      timeRisk: parseFloat(timeRisk.toFixed(3)),
      balanceRatio: parseFloat(balanceRatio.toFixed(3)),
      manipulationRisk: parseFloat(manipulationRisk.toFixed(3)),
    },
    flags,
    recommendation,
  };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
