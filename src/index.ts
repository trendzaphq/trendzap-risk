import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { assessRoutes } from './api/routes/assess';
import { marketRoutes } from './api/routes/market';
import { userRoutes } from './api/routes/user';
import { logger } from './utils/logger';

const app = Fastify({ logger });

await app.register(cors, { origin: true });

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
