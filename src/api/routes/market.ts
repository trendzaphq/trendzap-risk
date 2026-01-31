import type { FastifyInstance } from 'fastify';
import { getMarketHealth } from '../../scoring/market-health';

export async function marketRoutes(fastify: FastifyInstance) {
  fastify.get('/market/:marketId/health', async (request) => {
    const { marketId } = request.params as { marketId: string };
    return getMarketHealth(marketId);
  });
}
