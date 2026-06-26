-- ============================================================
-- Chain Reactors Trader — Top Traders L/S Ratio Snapshots
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Snapshots table
create table if not exists public.top_traders_ratio_snapshots (
  id               uuid primary key default gen_random_uuid(),
  symbol           text not null default 'BTCUSDT',
  exchange         text not null default 'binance',
  timestamp        timestamptz not null,         -- candle close time from Binance
  long_ratio       float not null,               -- e.g. 0.612 = 61.2%
  short_ratio      float not null,               -- e.g. 0.388 = 38.8%
  long_short_ratio float not null,               -- long/short ratio number
  open_interest    float,                        -- OI in USD (optional, future)
  source           text not null default 'binance_top_traders',
  created_at       timestamptz default now(),

  unique (symbol, exchange, timestamp)           -- no duplicate snapshots
);

-- Index for fast range queries (delta calculations)
create index if not exists idx_lsr_snapshots_symbol_ts
  on public.top_traders_ratio_snapshots (symbol, timestamp desc);

-- RLS: public read (anon key), service role writes
alter table public.top_traders_ratio_snapshots enable row level security;

drop policy if exists "lsr_public_read" on public.top_traders_ratio_snapshots;
create policy "lsr_public_read" on public.top_traders_ratio_snapshots
  for select using (true);

-- 2. Schedule lsr-collector via pg_cron (every 15 min)
-- Requires pg_cron: Dashboard > Database > Extensions > pg_cron
/*
select cron.schedule(
  'lsr-15min-collect',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://ncltwnrrzrqtxgxchnaf.supabase.co/functions/v1/lsr-collector',
      headers := '{}'::jsonb
    );
  $$
);
*/

-- 3. Auto-cleanup: keep only 30 days of snapshots (96 rows/day × 30 = ~2880 rows)
/*
select cron.schedule(
  'lsr-cleanup-30d',
  '0 3 * * *',
  $$
    delete from public.top_traders_ratio_snapshots
    where created_at < now() - interval '30 days';
  $$
);
*/

-- 4. Verify after first run:
-- select * from top_traders_ratio_snapshots order by timestamp desc limit 10;
