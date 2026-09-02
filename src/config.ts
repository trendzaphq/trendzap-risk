import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  subgraphUrl: process.env.SUBGRAPH_URL || '',

  /** Browser origins permitted to call this service, comma-separated. */
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  
  // Thresholds.
  //
  // Amounts are USDC at 6 decimals: 10 USDC = 10_000_000. These are fallbacks only —
  // per-tier limits from scoring/reputation-score.ts take precedence. Note the .env
  // comments used to describe them as "AVAX (in wei)", which is wrong by twelve orders
  // of magnitude; do not "correct" these values to 1e19.
  botScoreThreshold: parseFloat(process.env.BOT_SCORE_THRESHOLD || '0.7'),
  anomalyThreshold: parseFloat(process.env.ANOMALY_THRESHOLD || '0.8'),
  defaultMaxBetSize: BigInt(process.env.DEFAULT_MAX_BET_SIZE || '10000000'),   // 10 USDC
  defaultDailyLimit: BigInt(process.env.DEFAULT_DAILY_LIMIT || '100000000'),  // 100 USDC
};
