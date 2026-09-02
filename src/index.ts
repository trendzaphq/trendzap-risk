import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { assessRoutes } from './api/routes/assess';
import { marketRoutes } from './api/routes/market';
import { userRoutes } from './api/routes/user';
import { logger } from './utils/logger';
import { rateLimit } from './api/rate-limit';

// `as any`: the installed pino Logger type is missing `msgPrefix`, which Fastify's
// FastifyBaseLogger requires. Same workaround the oracle service uses.
const app = Fastify({ logger: logger as any });

// `origin: true` reflected any Origin, which is effectively open. Restrict to the
// configured app origins; empty disables cross-origin browser access entirely.
await app.register(cors, {
  origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : false,
});

// Rate limiting — the service previously had none.
app.addHook('onRequest', rateLimit({ bucket: 'global', max: 120, windowSeconds: 60 }));

// Register routes
await app.register(assessRoutes, { prefix: '/api/v1' });
await app.register(marketRoutes, { prefix: '/api/v1' });
await app.register(userRoutes, { prefix: '/api/v1' });

// Health check
app.get('/health', async () => ({ status: 'ok', service: 'trendzap-risk' }));

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`🛡️ TrendZap Risk Engine running on port ${config.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

start();

export { app };
