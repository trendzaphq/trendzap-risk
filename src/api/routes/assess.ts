import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assessRisk } from '../../detection';
import { logger } from '../../utils/logger';

const assessRequestSchema = z.object({
  type: z.enum(['bet', 'market_create', 'claim']),
  marketId: z.string().regex(/^\d{1,20}$/).optional(),
  // Must be an EVM address. This was `z.string()`, so every window, counter and
  // reputation score keyed on it could be reset by changing one field in the body.
  userId: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'userId must be a 0x-prefixed EVM address')
    .transform((a) => a.toLowerCase()),
  outcome: z.enum(['OVER', 'UNDER']).optional(),
  amount: z.string().regex(/^\d+$/, 'amount must be a non-negative integer string').optional(),
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
