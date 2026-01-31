import type { FastifyInstance } from 'fastify';
import { getUserReputation } from '../../scoring/reputation-score';

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/user/:address/reputation', async (request) => {
    const { address } = request.params as { address: string };
    return getUserReputation(address);
  });
}
