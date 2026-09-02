import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Market health score — market quality assessment.
 *
 * This module previously derived every metric from `simpleHash(marketId) % n`, i.e.
 * a hash of the market ID string. It returned confident-looking numbers, a
 * HEALTHY/WATCH/WARNING/CRITICAL recommendation, and flags such as "Severely
 * imbalanced — possible insider knowledge" — none of which reflected anything about
 * the market. Because the subgraph was never deployed, `subgraphUrl` is always empty
 * and that was always the code path taken.
 *
 * Rather than keep returning invented risk data for a betting product, this now
 * computes from the subgraph when one is configured, and reports `available: false`
 * when it cannot. Callers must handle the unavailable case; they must not present a
 * placeholder as an assessment.
 */

export interface MarketHealthMetrics {
  concentrationRisk: number;
  liquidityScore: number;
  timeRisk: number;
  balanceRatio: number;
  manipulationRisk: number;
}

export type MarketHealth =
  | {
      marketId: string;
      available: true;
      healthScore: number;
      metrics: MarketHealthMetrics;
      flags: string[];
      recommendation: 'HEALTHY' | 'WATCH' | 'WARNING' | 'CRITICAL';
    }
  | {
      marketId: string;
      available: false;
      reason: string;
    };

interface SubgraphMarket {
  totalVolume: string;
  qOver: string;
  qUnder: string;
  endTime: string;
  topHolderShares: string;
  totalShares: string;
}

export async function getMarketHealth(marketId: string): Promise<MarketHealth> {
  if (!config.subgraphUrl) {
    logger.warn({ marketId }, 'Subgraph not configured — market health unavailable');
    return {
      marketId,
      available: false,
      reason: 'Subgraph is not configured, so market health cannot be computed.',
    };
  }

  const market = await fetchMarket(marketId);
  if (!market) {
    return { marketId, available: false, reason: 'Market not found in the subgraph.' };
  }

  const flags: string[] = [];

  const totalShares = Number(market.totalShares);
  const topHolder = Number(market.topHolderShares);
  const qOver = Number(market.qOver);
  const qUnder = Number(market.qUnder);
  const totalVolume = Number(market.totalVolume);
  const endTime = Number(market.endTime);

  // Concentration: what fraction of outstanding shares the largest holder controls.
  const concentrationRisk = totalShares > 0 ? clamp01(topHolder / totalShares) : 0;

  // Liquidity: volume relative to a reference depth, saturating at 1 (higher = better).
  const LIQUIDITY_REFERENCE = 1_000_000_000; // 1,000 USDC at 6dp
  const liquidityScore = clamp01(totalVolume / LIQUIDITY_REFERENCE);

  // Time risk: rises as the market approaches resolution, when the incentive to
  // manipulate the underlying metric is highest.
  const secondsRemaining = endTime - Math.floor(Date.now() / 1000);
  const MANIPULATION_WINDOW = 6 * 3600;
  const timeRisk =
    secondsRemaining <= 0 ? 1 : clamp01(1 - secondsRemaining / MANIPULATION_WINDOW);

  // Balance: how one-sided the book is. 0 = evenly split, 1 = entirely one side.
  const totalQ = qOver + qUnder;
  const balanceRatio = totalQ > 0 ? clamp01(Math.abs(qOver - qUnder) / totalQ) : 0;

  const manipulationRisk = clamp01(
    concentrationRisk * 0.4 + (1 - liquidityScore) * 0.3 + balanceRatio * 0.3
  );

  if (concentrationRisk > 0.3) flags.push('High concentration — few wallets dominate');
  if (liquidityScore < 0.3) flags.push('Low liquidity — thin market');
  if (balanceRatio > 0.8) flags.push('Severely imbalanced — possible insider knowledge');
  if (timeRisk > 0.7) flags.push('Near resolution — elevated manipulation window');

  const healthScore = Math.max(0, 1 - manipulationRisk);
  let recommendation: 'HEALTHY' | 'WATCH' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
  if (healthScore < 0.3) recommendation = 'CRITICAL';
  else if (healthScore < 0.5) recommendation = 'WARNING';
  else if (healthScore < 0.7) recommendation = 'WATCH';

  return {
    marketId,
    available: true,
    healthScore: round3(healthScore),
    metrics: {
      concentrationRisk: round3(concentrationRisk),
      liquidityScore: round3(liquidityScore),
      timeRisk: round3(timeRisk),
      balanceRatio: round3(balanceRatio),
      manipulationRisk: round3(manipulationRisk),
    },
    flags,
    recommendation,
  };
}

async function fetchMarket(marketId: string): Promise<SubgraphMarket | null> {
  const query = `
    query MarketHealth($id: ID!) {
      market(id: $id) {
        totalVolume
        qOver
        qUnder
        endTime
        topHolderShares
        totalShares
      }
    }
  `;
  try {
    const res = await fetch(config.subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: marketId } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      logger.error({ marketId, status: res.status }, 'Subgraph query failed');
      return null;
    }
    const body = (await res.json()) as { data?: { market?: SubgraphMarket | null } };
    return body.data?.market ?? null;
  } catch (err) {
    logger.error({ marketId, err: (err as Error).message }, 'Subgraph unreachable');
    return null;
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round3 = (n: number) => parseFloat(n.toFixed(3));
