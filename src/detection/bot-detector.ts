import { config } from '../config';

export async function checkBotActivity(userId: string): Promise<{
  passed: boolean;
  score: number;
}> {
  // TODO: Call ML service for bot detection
  // For now, return placeholder
  const score = 0.1; // Low bot score = good
  
  return {
    passed: score < config.botScoreThreshold,
    score,
  };
}
