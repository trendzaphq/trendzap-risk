import { config } from '../config';

export async function checkPositionLimits(
  userId: string,
  marketId: string,
  amount: bigint
): Promise<{
  passed: boolean;
  current: bigint;
  max: bigint;
}> {
  // TODO: Fetch current position from subgraph
  const currentPosition = BigInt(0);
  const maxPosition = config.defaultMaxBetSize;
  
  const newTotal = currentPosition + amount;
  
  return {
    passed: newTotal <= maxPosition,
    current: currentPosition,
    max: maxPosition,
  };
}
