/**
 * Redis-backed request rate limiting.
 *
 * The risk service registered no rate limiting at all, unlike the oracle. Implemented
 * against the existing Redis connection rather than @fastify/rate-limit so it needs no
 * new dependency and the window is shared across service instances.
 *
 * Fails OPEN on a Redis error: this is abuse protection, not an authorisation control,
 * and taking the service down because Redis blipped would be worse than the abuse.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: 3 });

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Key prefix, so different routes get independent budgets. */
  bucket: string;
}

export function rateLimit(options: RateLimitOptions) {
  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply) {
    const ip = request.ip || 'unknown';
    const key = `risk:ratelimit:${options.bucket}:${ip}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, options.windowSeconds);
      }
      if (count > options.max) {
        const ttl = await redis.ttl(key);
        reply.header('retry-after', String(Math.max(1, ttl)));
        return reply.code(429).send({
          error: 'Too many requests',
          retryAfterSeconds: Math.max(1, ttl),
        });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Rate limiter unavailable — allowing request');
    }
  };
}
