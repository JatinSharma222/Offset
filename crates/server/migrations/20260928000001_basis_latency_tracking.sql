-- Migration: Add basis risk and execution latency tracking to execution_records
-- Spec: context/05-EXECUTION.md and context/07-BACKEND.md

ALTER TABLE execution_records
    ADD COLUMN IF NOT EXISTS protocol_reference_price NUMERIC(38, 12) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hyperliquid_fill_price   NUMERIC(38, 12),
    ADD COLUMN IF NOT EXISTS basis_bps                NUMERIC(38, 12),
    ADD COLUMN IF NOT EXISTS detected_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS filled_at                 TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS latency_ms                INTEGER;
