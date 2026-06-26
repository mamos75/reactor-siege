// mtc-checker — Mamos Trend Color signal calculator
// Runs every hour via pg_cron
// Fetches Binance weekly klines, calculates MTC gap, saves to signal_history

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_ASSETS = ["BTC", "ETH", "XRP", "SOL", "BNB", "AAVE", "LINK"];

async function getAssetsToProcess(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  // Récupère tous les symbols des watchlists users
  const { data, error } = await supabase
    .from("watchlists")
    .select("symbol");

  if (error || !data) return DEFAULT_ASSETS;

  const watchlistSymbols = data.map((r: { symbol: string }) => r.symbol.toUpperCase());

  // Union des defaults + watchlist, sans doublons
  const all = new Set([...DEFAULT_ASSETS, ...watchlistSymbols]);
  return Array.from(all);
}

// Backfill complet pour un asset absent de signal_history
async function backfillAsset(
  supabase: ReturnType<typeof createClient>,
  asset: string
): Promise<{ inserted: number; error?: string }> {
  // Récupère toutes les bougies weekly depuis le début de l'asset sur Binance
  const allCandles: { close: number; openTime: number }[] = [];
  let endTime: number | undefined = undefined;

  while (true) {
    let url = `https://api.binance.com/api/v3/klines?symbol=${asset}USDT&interval=1w&limit=1000`;
    if (endTime) url += `&endTime=${endTime}`;

    const res = await fetch(url);
    if (!res.ok) return { inserted: 0, error: `Binance ${res.status}` };
    const raw = await res.json() as string[][];
    if (raw.length === 0) break;

    for (const row of raw) {
      allCandles.push({ openTime: parseInt(row[0]), close: parseFloat(row[4]) });
    }
    if (raw.length < 1000) break;
    endTime = parseInt(raw[0][0]) - 1;
    await new Promise((r) => setTimeout(r, 300));
  }

  allCandles.sort((a, b) => a.openTime - b.openTime);
  if (allCandles.length < 50) return { inserted: 0, error: `Not enough candles: ${allCandles.length}` };

  const rows: object[] = [];
  for (let i = 49; i < allCandles.length; i++) {
    const windowCloses = allCandles.slice(Math.max(0, i - 149), i + 1).map(c => c.close).reverse();
    if (windowCloses.length < 50) continue;
    const { gap, ma16, ma50, color } = calcMTC(windowCloses);
    rows.push({
      symbol: asset,
      color,
      gap_value: gap.toFixed(4),
      ma16: ma16.toFixed(2),
      ma50: ma50.toFixed(2),
      price: allCandles[i].close.toFixed(2),
      calculated_at: new Date(allCandles[i].openTime).toISOString(),
    });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from("signal_history")
      .upsert(rows.slice(i, i + 100), { onConflict: "symbol,calculated_at", ignoreDuplicates: true });
    if (!error) inserted += Math.min(100, rows.length - i);
  }
  return { inserted };
}

// MTC Algorithm (exact mirror of dashboard.mamoscrypto.com)
function calcMTC(closes: number[]): { gap: number; ma16: number; ma50: number; color: string } {
  // closes[0] = most recent candle
  const ma16 = closes.slice(0, 16).reduce((a, b) => a + b, 0) / 16;
  const ma50 = closes.slice(0, 50).reduce((a, b) => a + b, 0) / 50;
  const gap = Math.abs(ma16 - ma50 * 2) / (ma50 * 2) * 100;

  let color: string;
  if (gap < 20)      color = "red";
  else if (gap < 42) color = "blue";
  else if (gap < 65) color = "yellow";
  else               color = "green";

  return { gap, ma16, ma50, color };
}

async function fetchBinanceKlines(symbol: string): Promise<number[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1w&limit=150`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance error for ${symbol}: ${res.status}`);
  const raw = await res.json() as string[][];

  // closes reversed: [0] = most recent
  const closes = raw.map((row: string[]) => parseFloat(row[4])).reverse();
  return closes;
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const ASSETS = await getAssetsToProcess(supabase);

  // Détecte les assets sans aucune donnée dans signal_history → backfill automatique
  const { data: existingSymbols } = await supabase
    .from("signal_history")
    .select("symbol")
    .in("symbol", ASSETS);

  const known = new Set((existingSymbols ?? []).map((r: { symbol: string }) => r.symbol));
  const toBackfill = ASSETS.filter(a => !known.has(a));

  const backfillResults: { symbol: string; inserted: number; error?: string }[] = [];
  for (const asset of toBackfill) {
    console.log(`New asset detected: ${asset} — starting backfill...`);
    const result = await backfillAsset(supabase, asset);
    backfillResults.push({ symbol: asset, ...result });
    console.log(`Backfill ${asset}: ${result.inserted} rows inserted`);
    await new Promise((r) => setTimeout(r, 500));
  }

  const results: { symbol: string; color: string; gap: number }[] = [];
  const errors: string[] = [];

  for (const asset of ASSETS) {
    try {
      const closes = await fetchBinanceKlines(asset);

      if (closes.length < 50) {
        errors.push(`${asset}: not enough data (${closes.length} candles)`);
        continue;
      }

      const { gap, ma16, ma50, color } = calcMTC(closes);
      const currentPrice = closes[0];

      const { error } = await supabase
        .from("signal_history")
        .insert({
          symbol: asset,
          color,
          gap_value: gap.toFixed(4),
          ma16: ma16.toFixed(2),
          ma50: ma50.toFixed(2),
          price: currentPrice.toFixed(2),
        });

      if (error) {
        errors.push(`${asset} DB error: ${error.message}`);
      } else {
        results.push({ symbol: asset, color, gap: parseFloat(gap.toFixed(2)) });
      }

      // Small delay to avoid Binance rate limit
      await new Promise((r) => setTimeout(r, 200));

    } catch (e) {
      errors.push(`${asset}: ${(e as Error).message}`);
    }
  }

  return new Response(
    JSON.stringify({ success: true, results, errors, timestamp: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
