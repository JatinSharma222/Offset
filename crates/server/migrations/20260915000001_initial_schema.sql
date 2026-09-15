CREATE TABLE IF NOT EXISTS risk_snapshots (
    id                       UUID PRIMARY KEY,
    timestamp                TIMESTAMPTZ NOT NULL,
    price                    NUMERIC(38, 12) NOT NULL,
    collateral_value         NUMERIC(38, 12) NOT NULL,
    risk_adjusted_collateral NUMERIC(38, 12) NOT NULL,
    debt_value               NUMERIC(38, 12) NOT NULL,
    health_factor            NUMERIC(38, 12),
    liquidation_price        NUMERIC(38, 12),
    liquidation_distance     NUMERIC(38, 12),
    risk_level               TEXT NOT NULL,
    emergency                BOOLEAN NOT NULL DEFAULT FALSE,
    exposure                 NUMERIC(38, 12) NOT NULL,
    hedge_ratio              NUMERIC(38, 12) NOT NULL,
    target_hedge             NUMERIC(38, 12) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON risk_snapshots (timestamp DESC);

CREATE TABLE IF NOT EXISTS execution_records (
    id                   UUID PRIMARY KEY,
    timestamp            TIMESTAMPTZ NOT NULL,
    risk_level           TEXT NOT NULL,
    liquidation_distance NUMERIC(38, 12),
    target_notional      NUMERIC(38, 12) NOT NULL,
    filled_notional      NUMERIC(38, 12) NOT NULL,
    avg_fill_price       NUMERIC(38, 12),
    reference_price      NUMERIC(38, 12) NOT NULL,
    slippage_bps         NUMERIC(38, 12),
    residual_exposure    NUMERIC(38, 12) NOT NULL,
    status               TEXT NOT NULL,
    note                 TEXT,
    cloid                TEXT,
    book_snapshot        JSONB
);
CREATE INDEX IF NOT EXISTS idx_executions_ts ON execution_records (timestamp DESC);

CREATE TABLE IF NOT EXISTS risk_policies (
    id         SERIAL PRIMARY KEY,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    policy     JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS scenarios (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    source_note TEXT NOT NULL,
    data        JSONB NOT NULL
);
