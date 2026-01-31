# TrendZap Risk Engine

> Anti-manipulation and risk management engine for TrendZap prediction markets - protecting market integrity with ML-powered detection.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-green)](https://python.org/)

---

## Overview

The TrendZap Risk Engine is a critical infrastructure component that ensures market integrity by:
- **Detecting bot activity** on social media metrics
- **Identifying wash trading** and market manipulation
- **Enforcing position limits** to prevent excessive concentration
- **Monitoring anomalies** in real-time
- **Scoring user reputation** based on trading history

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TrendZap Risk Engine                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │    Input     │   │  Detection   │   │   Scoring    │   │   Output     │ │
│  │   Streams    │──▶│   Engine     │──▶│   Engine     │──▶│   Actions    │ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘ │
│         │                  │                  │                  │          │
│         ▼                  ▼                  ▼                  ▼          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ Oracle Data  │   │ Bot Detector │   │ Reputation   │   │ Block/Flag   │ │
│  │ Market Data  │   │ Sybil Detect │   │ Market Score │   │ Alert        │ │
│  │ User Actions │   │ Anomaly Det  │   │ Risk Score   │   │ Rate Limit   │ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

### Detection Modules

| Module | Description | Status |
|--------|-------------|--------|
| **Bot Detector** | ML model to detect artificial engagement | 🔨 Building |
| **Sybil Detector** | Wallet clustering to identify sybil attacks | 🔨 Building |
| **Wash Trade Detector** | Identify self-trading patterns | 📋 Planned |
| **Velocity Monitor** | Flag unusual activity spikes | 🔨 Building |
| **Anomaly Detector** | Statistical anomaly detection | 🔨 Building |

### Risk Controls

| Control | Description |
|---------|-------------|
| **Position Limits** | Max bet size per user per market |
| **Market Limits** | Max total exposure per market |
| **User Limits** | Daily/weekly limits per user |
| **Concentration Limits** | Max % of market any user can hold |

### Reputation System

- **Trading History** - Win rate, volume, behavior
- **Verification Level** - KYC, social connections
- **Community Standing** - Reports, vouches
- **Prediction Accuracy** - Track record over time

## Tech Stack

### TypeScript Service
- Node.js 20+
- Fastify for API
- BullMQ for job queues
- Redis for caching

### Python ML Models
- Python 3.11+
- scikit-learn for ML
- pandas for data processing
- FastAPI for model serving

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Redis 7+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/trendzaphq/trendzap-risk.git
cd trendzap-risk

# Install Node.js dependencies
pnpm install

# Install Python dependencies
cd ml-models
pip install -r requirements.txt
cd ..

# Copy environment variables
cp .env.example .env

# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Run the service
pnpm dev
```

## API Endpoints

### Risk Assessment

```http
POST /api/v1/assess
Content-Type: application/json

{
  "type": "bet",
  "marketId": "123",
  "userId": "0x...",
  "outcome": "OVER",
  "amount": "1000000000000000000"
}
```

**Response:**
```json
{
  "allowed": true,
  "riskScore": 0.15,
  "checks": {
    "positionLimit": { "passed": true, "current": 5, "max": 100 },
    "dailyLimit": { "passed": true, "current": 10, "max": 50 },
    "sybilCheck": { "passed": true, "score": 0.02 },
    "velocityCheck": { "passed": true, "rate": 2 }
  },
  "warnings": []
}
```

### Market Health

```http
GET /api/v1/market/{marketId}/health
```

**Response:**
```json
{
  "marketId": "123",
  "healthScore": 0.85,
  "metrics": {
    "concentrationRisk": 0.2,
    "botActivityRisk": 0.1,
    "manipulationRisk": 0.15,
    "liquidityScore": 0.9
  },
  "flags": [],
  "recommendation": "HEALTHY"
}
```

### User Reputation

```http
GET /api/v1/user/{address}/reputation
```

**Response:**
```json
{
  "address": "0x...",
  "reputationScore": 75,
  "tier": "TRUSTED",
  "metrics": {
    "totalBets": 150,
    "winRate": 0.58,
    "avgBetSize": "5000000000000000000",
    "accountAge": 180,
    "verificationLevel": 2
  },
  "limits": {
    "maxBetSize": "100000000000000000000",
    "dailyLimit": "500000000000000000000"
  }
}
```

## Project Structure

```
trendzap-risk/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── assess.ts
│   │   │   ├── market.ts
│   │   │   └── user.ts
│   │   └── server.ts
│   ├── detection/
│   │   ├── bot-detector.ts
│   │   ├── sybil-detector.ts
│   │   ├── velocity-monitor.ts
│   │   └── anomaly-detector.ts
│   ├── limits/
│   │   ├── position-limits.ts
│   │   ├── market-limits.ts
│   │   └── user-limits.ts
│   ├── scoring/
│   │   ├── reputation-score.ts
│   │   └── market-health.ts
│   ├── alerts/
│   │   └── alert-manager.ts
│   ├── types/
│   └── index.ts
├── ml-models/
│   ├── bot_classifier/
│   │   ├── train.py
│   │   ├── model.py
│   │   └── serve.py
│   ├── anomaly_detector/
│   │   ├── train.py
│   │   └── model.py
│   └── requirements.txt
├── test/
├── package.json
└── README.md
```

## Configuration

### Position Limits

```typescript
const POSITION_LIMITS = {
  // Tier-based limits (in ETH)
  NEW_USER: {
    maxBetSize: 0.1,
    maxDailyVolume: 1,
    maxPositionsPerMarket: 1,
  },
  VERIFIED: {
    maxBetSize: 1,
    maxDailyVolume: 10,
    maxPositionsPerMarket: 3,
  },
  TRUSTED: {
    maxBetSize: 10,
    maxDailyVolume: 100,
    maxPositionsPerMarket: 5,
  },
  VIP: {
    maxBetSize: 100,
    maxDailyVolume: 1000,
    maxPositionsPerMarket: 10,
  },
};
```

### Anomaly Thresholds

```typescript
const ANOMALY_THRESHOLDS = {
  // Engagement velocity (% change per hour)
  maxEngagementVelocity: 500,
  
  // Bot score threshold
  botScoreThreshold: 0.7,
  
  // Sybil cluster size
  maxClusterSize: 5,
  
  // Wash trading threshold
  selfTradeThreshold: 0.3,
};
```

## ML Models

### Bot Classifier

Trained on:
- Engagement patterns
- Timing analysis
- Account characteristics
- Network behavior

Features:
- Account age
- Follower/following ratio
- Posting frequency
- Engagement rate
- Content patterns

### Anomaly Detector

Uses Isolation Forest for:
- Unusual volume spikes
- Abnormal betting patterns
- Suspicious timing clusters

## Related Repositories

| Repository | Description |
|------------|-------------|
| [trendzap-oracle](https://github.com/trendzaphq/trendzap-oracle) | Provides data that risk engine validates |
| [trendzap-contracts](https://github.com/trendzaphq/trendzap-contracts) | Enforces on-chain limits |
| [trendzap-intelligence](https://github.com/trendzaphq/trendzap-intelligence) | Advanced ML models |

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Protecting TrendZap market integrity 🛡️</strong>
</p>
