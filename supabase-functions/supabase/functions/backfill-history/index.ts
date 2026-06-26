// backfill-history — Mamos Trend Color
// Fetches full weekly candle history from Binance and populates signal_history
// for all assets. Run once manually via HTTP POST.
// Each weekly candle = one signal_history row with the MTC value at that date.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ASSETS = ["BTC", "ETH", "XRP", "SOL", "BNB", "AAVE", "LINK"];

function calcMTC(closes: number[]): { gap: number; ma16: number; ma50: number; color: string } {
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

async function fetchAllCandles(symbol: string): Promise<{ close: number; openTime: number }[]> {
  // Binance max = 1000 candles per request — fetch in batches going back in time
  const allCandles: { close: number; openTime: number }[] = [];
  let endTime: number | undefined = undefined;

  while (true) {
    let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1w&limit=1000`;
    if (endTime) url += `&endTime=${endTime}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance error ${res.status} for ${symbol}`);
    const raw = await res.json() as string[][];

    if (raw.length === 0) break;

    for (const row of raw) {
      allCandles.push({ openTime: parseInt(row[0]), close: parseFloat(row[4]) });
    }

    // If we got less than 1000, we've reached the beginning
    if (raw.length < 1000) break;

    // Move endTime back to just before the oldest candle we got
    endTime = parseInt(raw[0][0]) - 1;

    await new Promise((r) => setTimeout(r, 300));
  }

  // Sort oldest → newest
  allCandles.sort((a, b) => a.openTime - b.openTime);
  return allCandles;
}

Deno.serve(async (req) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Parse optional body: { assets: ["BTC", "ETH"] } to backfill specific assets
  let assetsToProcess = ASSETS;
  try {
    const body = await req.json();
    if (body.assets && Array.isArray(body.assets)) {
      assetsToProcess = body.assets;
    }
  } catch { /* use default */ }

  const summary: { symbol: string; inserted: number; error?: string }[] = [];

  for (const asset of assetsToProcess) {
    try {
      console.log(`Fetching candles for ${asset}...`);
      const candles = await fetchAllCandles(asset);

      if (candles.length < 50) {
        summary.push({ symbol: asset, inserted: 0, error: `Not enough candles: ${candles.length}` });
        continue;
      }

      // Calculate MTC for each candle (need 50 preceding closes)
      const rows: {
        symbol: string;
        color: string;
        gap_value: string;
        ma16: string;
        ma50: string;
        price: string;
        calculated_at: string;
      }[] = [];

      // closes array is oldest→newest, so index i has closes[i] = most recent at that point
      for (let i = 49; i < candles.length; i++) {
        // Build closes array from most recent (index i) going back
        const windowCloses = candles.slice(Math.max(0, i - 149), i + 1)
          .map(c => c.close)
          .reverse(); // [0] = most recent

        if (windowCloses.length < 50) continue;

        const { gap, ma16, ma50, color } = calcMTC(windowCloses);

        // Use the candle's open time as the timestamp (start of that week)
        const calculatedAt = new Date(candles[i].openTime).toISOString();

        rows.push({
          symbol: asset,
          color,
          gap_value: gap.toFixed(4),
          ma16: ma16.toFixed(2),
          ma50: ma50.toFixed(2),
          price: candles[i].close.toFixed(2),
          calculated_at: calculatedAt,
        });
      }

      // Insert in batches of 100 to avoid timeout
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase
          .from("signal_history")
          .upsert(batch, { onConflict: "symbol,calculated_at", ignoreDuplicates: false });

        if (error) {
          console.error(`Batch error for ${asset}:`, error.message);
        } else {
          inserted += batch.length;
        }
      }

      summary.push({ symbol: asset, inserted });
      console.log(`${asset}: inserted ${inserted} rows`);

    } catch (e) {
      summary.push({ symbol: asset, inserted: 0, error: (e as Error).message });
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return new Response(
    JSON.stringify({ success: true, summary, timestamp: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } },
  );
});
