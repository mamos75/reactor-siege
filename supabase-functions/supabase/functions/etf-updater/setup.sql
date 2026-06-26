-- ============================================================
-- Chain Reactors Trader — ETF Flows Table Setup
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. ETF Flows table (may already exist — safe to run)
create table if not exists public.etf_flows (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz default now(),
  date             date not null unique,
  daily_millions   numeric,       -- Latest trading day net flow (USD millions)
  weekly_millions  numeric,       -- Sum of last 5 trading days (USD millions)
  trend            text,          -- accelerating | slowing | positive | negative | mixed
  source           text default 'farside'
);

-- RLS: public read (anon key), service role writes
alter table public.etf_flows enable row level security;

drop policy if exists "etf_flows_public_read" on public.etf_flows;
create policy "etf_flows_public_read" on public.etf_flows
  for select using (true);

-- 2. Schedule etf-updater via pg_cron (every weekday at 22:00 UTC)
--    Farside updates after US market close (~4pm ET = 20:00 UTC), give 2h lag.
--    Requires pg_cron extension: Dashboard > Database > Extensions > pg_cron
--    Replace YOUR_PROJECT_REF and YOUR_SERVICE_KEY with real values.
/*
select cron.schedule(
  'etf-daily-update',
  '0 22 * * 1-5',   -- Mon-Fri at 22:00 UTC
  $$
    select net.http_post(
      url := 'https://ncltwnrrzrqtxgxchnaf.supabase.co/functions/v1/etf-updater',
      headers := '{}'::jsonb
    );
  $$
);
*/

-- 3. To trigger manually right now:
-- GET/POST https://ncltwnrrzrqtxgxchnaf.supabase.co/functions/v1/etf-updater
-- No Authorization header needed (verify_jwt = false)

-- 4. Verify table after first run:
-- select * from etf_flows order by date desc limit 5;
