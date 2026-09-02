import type { FastifyInstance } from 'fastify';
import { getMarketHealth } from '../../scoring/market-health';

export async function marketRoutes(fastify: FastifyInstance) {
  fastify.get('/market/:marketId/health', async (request, reply) => {
    const { marketId } = request.params as { marketId: string };

    if (!/^\d{1,20}$/.test(marketId)) {
      return reply.code(400).send({ error: 'marketId must be a numeric market ID' });
    }

    const health = await getMarketHealth(marketId);

    // 503 when the assessment could not be computed, so a caller cannot mistake an
    // unavailable result for a clean bill of health.
    if (!health.available) return reply.code(503).send(health);

    return health;
  });
}
