import type { FastifyInstance } from 'fastify';
import { getUserReputation } from '../../scoring/reputation-score';

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/user/:address/reputation', async (request, reply) => {
    const { address } = request.params as { address: string };

    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return reply.code(400).send({ error: 'address must be a 0x-prefixed EVM address' });
    }

    return getUserReputation(address.toLowerCase());
  });
}
