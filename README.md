# Offset — Automated Liquidation-Defense Infrastructure

> Risk-management firms tell protocols how much risk they should take. Offset is infrastructure that automatically takes the opposite market position when that risk materialises.

---

## The Problem

A Solana lending protocol holds volatile collateral (SOL) against stable debt (USDC). When SOL price drops, borrowers cross their liquidation boundary and liquidators seize and sell collateral at a discount:

- **Forced selling clusters** during crashes when DEX liquidity is thinnest.
- **Liquidation cascades** accelerate downward price velocity, worsening the selloff.
- **Slippage and penalties** erode capital recovery.
- If prices gap faster than liquidation capacity, collateral sells for less than the debt backing it, creating **bad debt** that the protocol or its depositors eat.

Protocols today either accept this structural vulnerability or retain advisory firms who suggest static risk parameters weeks after market conditions shift.

---

## The Solution

Offset provides autonomous, deterministic liquidation-defense infrastructure connecting Solana protocols to Hyperliquid deep perp liquidity:

```
    PROTOCOL POSITION (Solana)
              |
              v
      +---------------+
      |  RISK ENGINE  |   health factor, liquidation price, boundary distance
      +-------+-------+
              |
         risk rises
              |
              v
      +---------------+
      | HEDGE POLICY  |   boundary distance -> hedge ratio -> target notional
      +-------+-------+
              |
              v
      +---------------+
      |  HYPERLIQUID  |   short SOL-PERP via trading-only agent key
      +-------+-------+
              |
              v
           CRASH
              |
              v
       LOSS REDUCED
```

If the crash hits, gains from the short position offset liquidation penalties and bad debt. If the market stabilizes or rebounds, the hedge is closed for the cost of funding and slippage — functioning like a transparent, market-priced insurance premium.

---

## Key Guarantees

1. **Deterministic Execution:** No predictive black boxes, ML, or heuristics. Every action is governed by transparent mathematical formulas and configured boundary thresholds.
2. **Zero Custody:** Offset physically cannot touch or withdraw protocol funds. Hyperliquid's exchange-level agent wallet authorization delegates trade execution permissions only. Withdrawal or transfer calls fail structurally at the L1 consensus layer.
3. **Pure Risk Core:** The mathematical risk engine has zero network or database dependencies. It accepts positions and asset prices, computes liquidation boundaries, and outputs risk snapshots.
4. **Transparent Friction:** We do not claim frictionless execution. Slippage, top-of-book market depth, residual unhedged exposure, and funding costs are explicitly surfaced in every execution record.

---

## Architecture

The system is organized into a modular Rust workspace with a React TypeScript frontend:

```
Offset/
├── crates/
│   ├── risk-engine/    # Pure math: health factor, liquidation price, distance, hedge sizing
│   ├── execution/      # Hyperliquid integration, pre-trade safety rails, execution records
│   ├── data/           # Historical crash datasets & scenario loader (Solend Whale, FTX, Whipsaw)
│   ├── replay/         # Deterministic replay runner with full P&L & loss attribution
│   └── server/         # Axum web server, async-graphql, Postgres persistence, Redis pub/sub
└── web/                # React 18, TypeScript, Apollo Client, Tailwind CSS
```

### Core Components

- **Risk Engine (`crates/risk-engine`):** Operates entirely with `rust_decimal::Decimal` (no floating point in the money path). Evaluates multi-collateral health factors and exact liquidation distances.
- **Pre-Trade Safety Rails (`crates/execution/src/safety.rs`):** Five independent guards verify margin headroom, price staleness (<30s), maximum total notional caps, single-order clip limits, and the emergency circuit breaker.
- **Historical Replay (`crates/replay`):** Two-pass deterministic backtest simulating an identical crash with and without automated hedging, calculating net loss avoided, bad debt reduction, funding costs, and execution slippage.
- **Orchestration Loop (`crates/server/src/orchestration.rs`):** Background task that continuously evaluates collateral, monitors distance transitions, triggers safety-checked hedge orders, persists snapshots, and broadcasts live streams over WebSockets.

---

## Supported Historical Scenarios

| Scenario | Event | Collateral / Debt | Outcome With Offset |
|---|---|---|---|
| **Solend Whale** | May 2022 | 5.7M SOL / $108M USDC | Bad debt eliminated (100% reduction), net loss reduced by >$20M |
| **FTX Contagion** | Nov 2022 | 450K SOL / $6.8M USDC | Deep multi-day drawdown defended through tiered short allocations |
| **Market Whipsaw** | Mar 2023 | 200K SOL / $2.8M USDC | Transparent cost tracking during rapid false-alarm recovery |

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Rust (1.80+)
- Bun (for frontend package management)

### 1. Full Stack in Docker

```bash
# Clone and prepare environment
cp .env.example .env

# Launch Postgres, Redis, Rust Backend, and Frontend
docker compose up --build
```

- **Web Dashboard:** `http://localhost:5173`
- **GraphQL Playground:** `http://localhost:8080/graphql`
- **WebSocket Subscriptions:** `ws://localhost:8080/graphql/ws`

### 2. Native Development

```bash
# Start background dependencies
docker compose up postgres redis -d

# Run backend
cargo run -p Offset-server

# Run frontend (in web directory)
cd web && bun install && bun run dev
```

### 3. Running Tests

```bash
# Run all workspace unit and integration tests
cargo test --workspace

# Run pure risk engine tests (zero I/O, runs offline)
cargo test -p risk-engine

# Verify linting
cargo clippy --workspace -- -D warnings
```

---

## Scope Limits & Future Roadmap

- **Currently Implemented:** Deterministic risk evaluation, Hyperliquid testnet execution, pre-trade safety rails, PostgreSQL persistence, Redis pub/sub, GraphQL API + WebSockets, historical crash replay, and instrument dashboard.
- **Intentionally Deferred:** Cross-venue routing, multi-asset continuous liquidation surfaces, and retail consumer apps.
- **Roadmap:** Direct Solana RPC account indexing for Kamino/Save lending reserves, on-chain proof-of-hedge oracle attestations, and multi-collateral automated rebalancing.
