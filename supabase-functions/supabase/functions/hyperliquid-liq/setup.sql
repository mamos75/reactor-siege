-- real_liquidation_events — Hyperliquid live liquidation stream
-- Run this once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS real_liquidation_events (
    id              bigserial PRIMARY KEY,
    exchange        text        NOT NULL DEFAULT 'hyperliquid',
    coin            text        NOT NULL DEFAULT 'BTC',
    side            text        NOT NULL CHECK (side IN ('long', 'short')),
    price_usd       numeric     NOT NULL,
    size_usd        bigint      NOT NULL,
    raw_size        numeric,
    timestamp_ms    bigint      NOT NULL,
    hash            text,
    inserted_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (exchange, coin, timestamp_ms, hash)
);

CREATE INDEX IF NOT EXISTS idx_real_liq_coin_ts
    ON real_liquidation_events (coin, timestamp_ms DESC);

ALTER TABLE real_liquidation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read real liquidations"
    ON real_liquidation_events FOR SELECT
    USING (true);

-- pg_cron: purge rows older than 7 days at 3am daily
SELECT cron.schedule(
    'purge-old-liquidations',
    '0 3 * * *',
    $$DELETE FROM real_liquidation_events WHERE timestamp_ms < (extract(epoch from now()) * 1000 - 7 * 86400000)::bigint$$
);
