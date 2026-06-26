-- ============================================================
-- Chain Reactors Trader — COT Tables Setup
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. COT Reports table
create table if not exists public.cot_reports (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz default now(),
  report_date         date not null,
  asset               text not null default 'BTC',

  open_interest       integer default 0,

  -- Dealers / Commercials
  commercials_long    integer default 0,
  commercials_short   integer default 0,

  -- Asset Managers / Institutions
  asset_manager_long  integer default 0,
  asset_manager_short integer default 0,

  -- Leveraged Funds / Hedge Funds
  leveraged_long      integer default 0,
  leveraged_short     integer default 0,

  -- Other / Retail
  retail_long         integer default 0,
  retail_short        integer default 0,

  -- Computed bias labels (stored for fast reads)
  institutions_bias   text default 'NEUTRE',
  hedge_fund_bias     text default 'NEUTRE',

  unique (report_date, asset)
);

-- RLS: anyone authenticated can read, only service role can write
alter table public.cot_reports enable row level security;

drop policy if exists "cot_reports_read" on public.cot_reports;
create policy "cot_reports_read" on public.cot_reports
  for select using (auth.role() = 'authenticated');

-- 2. COT Flip Alerts table
create table if not exists public.cot_flip_alerts (
  id           uuid primary key default gen_random_uuid(),
  detected_at  timestamptz default now(),
  asset        text not null default 'BTC',
  category     text not null,          -- 'Institutions' | 'Hedge Funds'
  from_bias    text not null,
  to_bias      text not null,
  magnitude    integer default 0
);

alter table public.cot_flip_alerts enable row level security;

drop policy if exists "cot_flip_alerts_read" on public.cot_flip_alerts;
create policy "cot_flip_alerts_read" on public.cot_flip_alerts
  for select using (auth.role() = 'authenticated');

-- 3. Schedule cot-updater via pg_cron (every Friday at 17:30 UTC)
-- Requires pg_cron extension enabled in Supabase Dashboard > Database > Extensions
-- Replace YOUR_PROJECT_REF and YOUR_ANON_KEY with real values
/*
select cron.schedule(
  'cot-weekly-update',
  '30 17 * * 5',  -- Friday 17:30 UTC
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/cot-updater',
      headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
    );
  $$
);
*/

-- 4. To trigger manually right now (test the function):
-- POST https://ncltwnrrzrqtxgxchnaf.supabase.co/functions/v1/cot-updater
-- Header: Authorization: Bearer <your-anon-key>
