-- binance-liq-collector setup
-- Run in Supabase SQL Editor AFTER hyperliquid-liq/setup.sql

-- 1. Add raw_payload column if missing (stores the raw Binance JSON)
ALTER TABLE real_liquidation_events
    ADD COLUMN IF NOT EXISTS raw_payload jsonb DEFAULT NULL;

-- 2. pg_cron: run binance-liq-collector every 5 minutes
SELECT cron.schedule(
    'binance-liq-5min',
    '*/5 * * * *',
    $$SELECT net.http_post(
        url := 'https://ncltwnrrzrqtxgxchnaf.supabase.co/functions/v1/binance-liq-collector',
        headers := jsonb_build_object('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jbHR3bnJyenJxdHhneGNobmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNjY4OTIsImV4cCI6MjA5MTY0Mjg5Mn0.JShY8xzrBpErlfrdXt2PuuByZ1Zy9oaKNU6IvAhCArY')
    )$$
);

-- 3. Materialized views for CT / MT / LT aggregation
-- These are the source for LiquidationMemoryEngine

-- ── CT: Current Trend (4h window) ─────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS liq_agg_ct AS
SELECT
    coin,
    SUM(CASE WHEN side = 'long'  THEN size_usd ELSE 0 END)::bigint  AS long_usd_4h,
    SUM(CASE WHEN side = 'short' THEN size_usd ELSE 0 END)::bigint  AS short_usd_4h,
    COUNT(CASE WHEN side = 'long'  THEN 1 END)::int                 AS long_count_4h,
    COUNT(CASE WHEN side = 'short' THEN 1 END)::int                 AS short_count_4h,
    MAX(CASE WHEN side = 'long'  THEN size_usd ELSE 0 END)::bigint  AS max_long_event_4h,
    MAX(CASE WHEN side = 'short' THEN size_usd ELSE 0 END)::bigint  AS max_short_event_4h
FROM real_liquidation_events
WHERE timestamp_ms > (extract(epoch from now()) * 1000 - 4 * 3600000)::bigint
GROUP BY coin
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS liq_agg_ct_coin ON liq_agg_ct (coin);

-- ── MT: Medium Trend (72h window + 24h sub-window) ────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS liq_agg_mt AS
SELECT
    coin,
    SUM(CASE WHEN side = 'long'  THEN size_usd ELSE 0 END)::bigint  AS long_usd_72h,
    SUM(CASE WHEN side = 'short' THEN size_usd ELSE 0 END)::bigint  AS short_usd_72h,
    COUNT(CASE WHEN side = 'long'  THEN 1 END)::int                 AS long_count_72h,
    COUNT(CASE WHEN side = 'short' THEN 1 END)::int                 AS short_count_72h,
    -- 24h sub-window for trend acceleration detection
    SUM(CASE WHEN side = 'long'  AND timestamp_ms > (extract(epoch from now()) * 1000 - 86400000)::bigint
             THEN size_usd ELSE 0 END)::bigint  AS long_usd_24h,
    SUM(CASE WHEN side = 'short' AND timestamp_ms > (extract(epoch from now()) * 1000 - 86400000)::bigint
             THEN size_usd ELSE 0 END)::bigint  AS short_usd_24h
FROM real_liquidation_events
WHERE timestamp_ms > (extract(epoch from now()) * 1000 - 72 * 3600000)::bigint
GROUP BY coin
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS liq_agg_mt_coin ON liq_agg_mt (coin);

-- ── LT: Long Trend (30d window + biggest wipeout events) ──────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS liq_agg_lt AS
SELECT
    coin,
    SUM(CASE WHEN side = 'long'  THEN size_usd ELSE 0 END)::bigint  AS long_usd_30d,
    SUM(CASE WHEN side = 'short' THEN size_usd ELSE 0 END)::bigint  AS short_usd_30d,
    COUNT(CASE WHEN side = 'long'  THEN 1 END)::int                 AS long_count_30d,
    COUNT(CASE WHEN side = 'short' THEN 1 END)::int                 AS short_count_30d,
    -- Biggest single wipeout events (relevant for "the market flushed longs once before")
    MAX(CASE WHEN side = 'long'  THEN size_usd ELSE 0 END)::bigint  AS biggest_long_wipeout,
    MAX(CASE WHEN side = 'short' THEN size_usd ELSE 0 END)::bigint  AS biggest_short_wipeout
FROM real_liquidation_events
WHERE timestamp_ms > (extract(epoch from now()) * 1000 - 30::bigint * 86400000)::bigint
GROUP BY coin
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS liq_agg_lt_coin ON liq_agg_lt (coin);

-- 4. RLS on materialized views (public read)
ALTER MATERIALIZED VIEW liq_agg_ct OWNER TO postgres;
ALTER MATERIALIZED VIEW liq_agg_mt OWNER TO postgres;
ALTER MATERIALIZED VIEW liq_agg_lt OWNER TO postgres;

GRANT SELECT ON liq_agg_ct TO anon, authenticated;
GRANT SELECT ON liq_agg_mt TO anon, authenticated;
GRANT SELECT ON liq_agg_lt TO anon, authenticated;

-- 5. pg_cron: refresh materialized views every 5 minutes
SELECT cron.schedule(
    'refresh-liq-agg-ct',
    '*/5 * * * *',
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY liq_agg_ct$$
);

SELECT cron.schedule(
    'refresh-liq-agg-mt',
    '*/5 * * * *',
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY liq_agg_mt$$
);

SELECT cron.schedule(
    'refresh-liq-agg-lt',
    '0 * * * *',
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY liq_agg_lt$$
);

-- 6. Extend purge from 7 days to 35 days (to feed LT 30d window)
-- First delete old purge job
SELECT cron.unschedule('purge-old-liquidations');

-- Recreate with 35 day retention
SELECT cron.schedule(
    'purge-old-liquidations',
    '0 3 * * *',
    $$DELETE FROM real_liquidation_events
      WHERE timestamp_ms < (extract(epoch from now()) * 1000 - 35::bigint * 86400000)::bigint$$
);
