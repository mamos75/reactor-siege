-- ─── email-alerts setup ──────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor after deploying the email-alerts function.

-- 1. Schedule email-alerts to run 2 minutes after mtc-checker (which runs at :00)
--    mtc-checker  → every hour at :00
--    push-alerts  → every hour at :01
--    email-alerts → every hour at :02
--    (adjust if your mtc-checker schedule is different)

select cron.schedule(
  'email-alerts-hourly',
  '2 * * * *',   -- at minute 2 of every hour
  $$
    select net.http_post(
      url    := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_EDGE_BASE_URL') || '/functions/v1/email-alerts',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY')
      ),
      body   := '{}'::jsonb
    );
  $$
);

-- 2. To unschedule:
--    select cron.unschedule('email-alerts-hourly');

-- 3. Required Supabase secret (set via CLI or dashboard):
--    supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx

-- 4. Verify the get_zone_changes() RPC exists (used by push-alerts and email-alerts):
--    It should already be in place if push-alerts is working.
--    If not, create it:

/*
create or replace function get_zone_changes()
returns table(symbol text, prev_color text, new_color text)
language sql
stable
as $$
  with ranked as (
    select
      symbol,
      color,
      calculated_at,
      row_number() over (partition by symbol order by calculated_at desc) as rn
    from signal_history
  )
  select
    a.symbol,
    b.color as prev_color,
    a.color as new_color
  from ranked a
  join ranked b on a.symbol = b.symbol and b.rn = 2
  where a.rn = 1
    and a.color <> b.color;
$$;
*/
