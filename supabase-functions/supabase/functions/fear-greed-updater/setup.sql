-- fear-greed-updater/setup.sql
-- Run once to create the table that stores CMC Fear & Greed history
-- with the full Sentiment Cycle Engine analysis columns.

CREATE TABLE IF NOT EXISTS crypto_fear_greed_history (
    id                      bigserial PRIMARY KEY,
    date                    date        NOT NULL UNIQUE,      -- one row per calendar day
    value                   smallint    NOT NULL CHECK (value BETWEEN 0 AND 100),
    classification          text        NOT NULL,             -- raw CMC label
    zone                    text        NOT NULL,             -- extreme_fear | fear | neutral | greed | extreme_greed

    -- Averages
    avg_7d                  numeric(6,2),
    avg_14d                 numeric(6,2),
    avg_30d                 numeric(6,2),

    -- Slopes (simple delta vs N days ago)
    slope_7d                numeric(6,2),
    slope_14d               numeric(6,2),
    slope_30d               numeric(6,2),

    -- Linear regression slopes
    regression_slope_14d    numeric(8,3),
    regression_slope_30d    numeric(8,3),

    -- Direction label
    direction               text,        -- neutral | rising_sentiment | strong_rising_sentiment | falling_sentiment | strong_falling_sentiment | fear_rebound | greed_cooling

    -- Cycle origin (latest extreme cluster before current phase)
    cycle_origin_type       text,        -- extreme_fear | extreme_greed | unknown
    cycle_origin_label      text,
    cycle_origin_start_date date,
    cycle_origin_end_date   date,
    cycle_origin_duration_days integer,
    cycle_origin_avg_value  numeric(6,2),
    cycle_origin_distance   numeric(6,2),

    -- Risk scores
    top_risk_score          numeric(5,1) CHECK (top_risk_score  BETWEEN 0 AND 100),
    bottom_risk_score       numeric(5,1) CHECK (bottom_risk_score BETWEEN 0 AND 100),

    -- Bias / market phase
    bias                    text,        -- near_top_risk | top_risk_building | near_bottom_risk | bottom_risk_building | transition_or_neutral
    market_phase            text,

    -- Interpretation text
    interpretation          text,

    -- Metadata
    lookback_days_used      smallint,
    computed_at             timestamptz  NOT NULL DEFAULT now()
);

-- Index for fast latest-row query from iOS app
CREATE INDEX IF NOT EXISTS idx_fgh_date ON crypto_fear_greed_history (date DESC);

-- Row-level security: public read (no auth needed for display)
ALTER TABLE crypto_fear_greed_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON crypto_fear_greed_history FOR SELECT USING (true);
