export async function getUserReputation(address: string) {
  // TODO: Implement reputation scoring from subgraph data
  return {
    address,
    reputationScore: 75,
    tier: 'TRUSTED',
    metrics: {
      totalBets: 150,
      winRate: 0.58,
      avgBetSize: '5000000000000000000',
      accountAge: 180,
      verificationLevel: 2,
    },
    limits: {
      maxBetSize: '100000000000000000000',
      dailyLimit: '500000000000000000000',
    },
  };
}
