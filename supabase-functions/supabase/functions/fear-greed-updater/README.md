# fear-greed-updater

Sentiment Cycle Engine — fetches CMC Fear & Greed history (200 days), computes full analysis, and stores latest row in Supabase.

## Setup

1. Run `setup.sql` once on your Supabase project to create the `crypto_fear_greed_history` table.

2. Install dependencies on the VPS:
   ```sh
   cd /opt/chain-reactors/fear-greed-updater
   npm install dotenv
   ```

3. Create `.env` next to the script:
   ```
   CMC_API_KEY=your_cmc_key
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. Add crontab entry (every 12h at 00:30 and 12:30):
   ```
   30 0,12 * * * /usr/bin/node /opt/chain-reactors/fear-greed-updater/fetch-and-store.mjs >> /var/log/fear-greed.log 2>&1
   ```

## Output columns

| Column | Description |
|--------|-------------|
| `value` | Raw CMC index (0–100) |
| `zone` | extreme_fear / fear / neutral / greed / extreme_greed |
| `avg_7d/14d/30d` | Rolling averages |
| `slope_7d/14d/30d` | Simple delta vs N days ago |
| `regression_slope_14d/30d` | Linear regression slope |
| `direction` | Trend direction label |
| `cycle_origin_*` | Last extreme cluster before current phase |
| `top_risk_score` | 0–100 risk of market top |
| `bottom_risk_score` | 0–100 probability of market bottom |
| `bias` | near_top_risk / top_risk_building / near_bottom_risk / bottom_risk_building / transition_or_neutral |
| `interpretation` | Human-readable analysis text (French) |
