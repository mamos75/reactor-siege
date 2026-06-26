// binance-liq-collector — Chain Reactors Trader
// Fetches Binance USDT-M forced liquidation orders (forceOrders endpoint).
// Normalises into real_liquidation_events alongside Hyperliquid events.
// Called by pg_cron every 5 minutes.
//
// Binance endpoint:
//   GET /fapi/v1/forceOrders?symbol=BTCUSDT&limit=100
//   No API key required for public data.
//   Returns last 7 days max, up to 100 events per call.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BINANCE_URL = "https://fapi.binance.com/fapi/v1/forceOrders";
const SYMBOL      = "BTCUSDT";
const COIN        = "BTC";

interface BinanceForceOrder {
  symbol:           string;
  price:            string;
  origQty:          string;
  executedQty:      string;
  averagePrice:     string;
  status:           string;
  timeInForce:      string;
  type:             string;
  side:             string;   // "BUY" | "SELL"
  time:             number;
  updateTime:       number;
}

// BUY  = buying back a short → SHORT was liquidated
// SELL = selling a long     → LONG  was liquidated
function normaliseSide(binanceSide: string): "long" | "short" {
  return binanceSide === "SELL" ? "long" : "short";
}

async function fetchForceOrders(startTime?: number): Promise<BinanceForceOrder[]> {
  const params = new URLSearchParams({
    symbol: SYMBOL,
    limit:  "100",
  });
  if (startTime) params.set("startTime", String(startTime));

  const res = await fetch(`${BINANCE_URL}?${params}`, {
    headers: { "Accept": "application/json" },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Binance forceOrders failed: ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Support ?backfill=true&hours=72 to fetch historical window
  const url       = new URL(req.url);
  const backfill  = url.searchParams.get("backfill") === "true";
  const hoursBack = parseInt(url.searchParams.get("hours") ?? "0") || 0;

  try {
    let startTime: number | undefined;
    if (backfill && hoursBack > 0) {
      startTime = Date.now() - hoursBack * 3_600_000;
    } else {
      // Default: last 10 minutes (cron mode — overlap to avoid gaps)
      startTime = Date.now() - 10 * 60_000;
    }

    const orders = await fetchForceOrders(startTime);

    if (!orders.length) {
      return Response.json({ ok: true, inserted: 0, message: "No force orders in window" });
    }

    const rows = orders
      .filter(o => o.status === "FILLED" && parseFloat(o.executedQty) > 0)
      .map(o => {
        const price   = parseFloat(o.averagePrice || o.price);
        const qty     = parseFloat(o.executedQty);
        const sizeUsd = Math.round(price * qty);
        const side    = normaliseSide(o.side);
        return {
          exchange:        "binance",
          coin:            COIN,
          side,
          price_usd:       price,
          size_usd:        sizeUsd,
          raw_size:        qty,
          timestamp_ms:    o.time,
          hash:            `binance_${o.time}_${o.side}_${qty}`,
          raw_payload:     o,
        };
      });

    if (!rows.length) {
      return Response.json({ ok: true, inserted: 0, message: "No filled orders in window" });
    }

    const { error } = await supabase
      .from("real_liquidation_events")
      .upsert(rows, { onConflict: "exchange,coin,timestamp_ms,hash" });

    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

    const summary = {
      longs:  rows.filter(r => r.side === "long").length,
      shorts: rows.filter(r => r.side === "short").length,
      totalUsd: rows.reduce((s, r) => s + r.size_usd, 0),
    };

    console.log(`[binance-liq] inserted=${rows.length} longs=${summary.longs} shorts=${summary.shorts} usd=$${(summary.totalUsd/1e6).toFixed(1)}M`);

    return Response.json({ ok: true, inserted: rows.length, summary });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("binance-liq-collector error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
