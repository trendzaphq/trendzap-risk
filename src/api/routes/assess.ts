import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assessRisk } from '../../detection';
import { logger } from '../../utils/logger';

const assessRequestSchema = z.object({
  type: z.enum(['bet', 'market_create', 'claim']),
  marketId: z.string().optional(),
  userId: z.string(),
  outcome: z.enum(['OVER', 'UNDER']).optional(),
  amount: z.string().optional(),
});

export async function assessRoutes(fastify: FastifyInstance) {
  fastify.post('/assess', async (request, reply) => {
    try {
      const body = assessRequestSchema.parse(request.body);
      
      logger.info({ body }, 'Assessing risk');
      
      const result = await assessRisk(body);
      
      return result;
    } catch (error) {
      logger.error({ error }, 'Risk assessment failed');
      
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          allowed: false,
          error: 'Invalid request',
          details: error.errors,
        });
      }
      
      return reply.status(500).send({
        allowed: false,
        error: 'Risk assessment failed',
      });
    }
  });
}
