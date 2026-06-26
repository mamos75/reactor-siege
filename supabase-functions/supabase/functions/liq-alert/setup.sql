-- liq-alert setup — Run once in Supabase SQL Editor

-- 1. Add notified_at column to real_liquidation_events
ALTER TABLE real_liquidation_events
    ADD COLUMN IF NOT EXISTS notified_at timestamptz DEFAULT NULL;

-- 2. push_tokens table (if not already created by push-alerts)
CREATE TABLE IF NOT EXISTS push_tokens (
    id          bigserial PRIMARY KEY,
    user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
    token       text        NOT NULL,
    device_name text,
    app         text        NOT NULL DEFAULT 'chain_reactors_trader',
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users manage own tokens"
    ON push_tokens FOR ALL
    USING (auth.uid() = user_id);

-- 3. notification_preferences table
--    Synced from iOS UserDefaults via PushTokenManager.syncPreferences()
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    notif_liq_alert  boolean NOT NULL DEFAULT true,
    notif_cot_flip   boolean NOT NULL DEFAULT true,
    notif_daily_brief boolean NOT NULL DEFAULT true,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users manage own prefs"
    ON notification_preferences FOR ALL
    USING (auth.uid() = user_id);

-- 4. pg_cron: run liq-alert every 2 minutes
SELECT cron.schedule(
    'liq-alert-2min',
    '*/2 * * * *',
    $$SELECT net.http_post(
        url := 'https://ncltwnrrzrqtxgxchnaf.supabase.co/functions/v1/liq-alert',
        headers := jsonb_build_object('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jbHR3bnJyenJxdHhneGNobmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNjY4OTIsImV4cCI6MjA5MTY0Mjg5Mn0.JShY8xzrBpErlfrdXt2PuuByZ1Zy9oaKNU6IvAhCArY')
    )$$
);
