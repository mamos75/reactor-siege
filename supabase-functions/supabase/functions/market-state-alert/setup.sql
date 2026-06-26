-- market-state-alert setup
-- Exécuter une seule fois dans l'éditeur SQL Supabase.

-- TABLE : cooldowns par type d'alerte (évite le spam)
CREATE TABLE IF NOT EXISTS market_alert_cooldowns (
    alert_type    TEXT NOT NULL,
    symbol        TEXT NOT NULL DEFAULT 'BTCUSDT',
    last_fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (alert_type, symbol)
);

-- Pas de RLS — accès service role uniquement (Edge Function)

-- pg_cron : toutes les 20 minutes
-- Nécessite que l'extension pg_cron soit activée (Dashboard > Database > Extensions)
SELECT cron.schedule(
    'market-state-alert',
    '*/20 * * * *',
    $$
    SELECT net.http_post(
        url  := current_setting('app.settings.supabase_url') || '/functions/v1/market-state-alert',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);
