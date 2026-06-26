// lsr-collector — Chain Reactors Trader
// Fetches Binance Top Traders Long/Short Account Ratio (BTCUSDT, 15m candle)
// and inserts a snapshot into top_traders_ratio_snapshots.
// Called by pg_cron every 15 minutes.
//
// Binance endpoint: GET /futures/data/topLongShortAccountRatio
//   ?symbol=BTCUSDT&period=15m&limit=2
// Returns newest-first array of { symbol, longShortRatio, longAccount, shortAccount, timestamp }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BINANCE_URL = "https://fapi.binance.com/futures/data/topLongShortAccountRatio";
const SYMBOL = "BTCUSDT";

interface BinanceLSR {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

async function fetchBinanceLSR(): Promise<BinanceLSR> {
  const url = `${BINANCE_URL}?symbol=${SYMBOL}&period=15m&limit=1`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Binance fetch failed: ${res.status}`);
  const data: BinanceLSR[] = await res.json();
  if (!data || data.length === 0) throw new Error("Empty response from Binance");
  return data[0];
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const raw = await fetchBinanceLSR();

    const longRatio  = parseFloat(raw.longAccount);
    const shortRatio = parseFloat(raw.shortAccount);
    const lsRatio    = parseFloat(raw.longShortRatio);
    const ts         = new Date(raw.timestamp).toISOString();

    console.log(`LSR snapshot: ${ts} | long=${(longRatio*100).toFixed(1)}% short=${(shortRatio*100).toFixed(1)}% ratio=${lsRatio.toFixed(3)}`);

    // Upsert — safe to run multiple times for same candle
    const { error } = await supabase
      .from("top_traders_ratio_snapshots")
      .upsert({
        symbol:           SYMBOL,
        exchange:         "binance",
        timestamp:        ts,
        long_ratio:       longRatio,
        short_ratio:      shortRatio,
        long_short_ratio: lsRatio,
        source:           "binance_top_traders",
      }, { onConflict: "symbol,exchange,timestamp" });

    if (error) throw new Error(`Insert failed: ${error.message}`);

    return Response.json({
      ok: true,
      timestamp: ts,
      long_pct: `${(longRatio * 100).toFixed(1)}%`,
      short_pct: `${(shortRatio * 100).toFixed(1)}%`,
      ratio: lsRatio,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("lsr-collector error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
