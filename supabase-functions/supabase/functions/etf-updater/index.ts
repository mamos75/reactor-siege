// etf-updater — Chain Reactors Trader
// Scrapes Farside Investors BTC ETF flow table (farside.co.uk/bitcoin-etf-flow-all-data/)
// Extracts daily total net flows, computes weekly sum, upserts into etf_flows table.
// Called by pg_cron every weekday at 22:00 UTC (after US market close + Farside update lag).
// Can also be triggered manually via POST for backfill.
//
// Farside HTML structure:
//   <table class="etf"> ... <tbody> <tr> <td>Date</td> <td>GBTC</td> ... <td>Total</td> </tr> </tbody>
//   Date format: "18 Apr 2026"  |  Total column: "-123.4" or "123.4" (USD millions, may be empty)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const FARSIDE_URL = "https://farside.co.uk/bitcoin-etf-flow-all-data/";

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchFarside(): Promise<string> {
  const res = await fetch(FARSIDE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://farside.co.uk/",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Farside fetch failed: ${res.status}`);
  return res.text();
}

// ─── Parse ────────────────────────────────────────────────────────────────────

interface ETFRow {
  date: string;       // ISO "YYYY-MM-DD"
  totalMillions: number; // can be negative
}

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseDate(raw: string): string | null {
  // "18 Apr 2026" → "2026-04-18"
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[2]];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function parseNumber(raw: string): number | null {
  const s = raw.replace(/,/g, "").trim();
  if (s === "" || s === "-" || s.toLowerCase() === "n/a") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseFarside(html: string): ETFRow[] {
  // Extract the main ETF table — Farside uses <table class="etf"> or similar
  // We'll grab all <tr> rows and look for ones starting with a date-like cell
  const rows: ETFRow[] = [];

  // Split into rows
  const trMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  // Find header row to locate the "Total" column index
  let totalColIndex = -1;
  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)];
    const texts = cells.map((c) => stripTags(c[1]));
    const idx = texts.findIndex((t) => t.toLowerCase() === "total");
    if (idx !== -1) {
      totalColIndex = idx;
      break;
    }
  }

  if (totalColIndex === -1) {
    throw new Error("Could not find 'Total' column in Farside table");
  }

  for (const tr of trMatches) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)];
    const texts = cells.map((c) => stripTags(c[1]));

    // First cell should be a date
    const date = parseDate(texts[0] ?? "");
    if (!date) continue;

    // Last data column should be Total
    const totalRaw = texts[totalColIndex] ?? "";
    const total = parseNumber(totalRaw);
    if (total === null) continue; // skip rows with no total yet (today if market still open)

    rows.push({ date, totalMillions: total });
  }

  return rows;
}

// ─── Build ETFFlows record ────────────────────────────────────────────────────

function buildFlowsRecord(rows: ETFRow[]) {
  // rows newest-first
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));

  const latest = sorted[0];
  const dailyM = latest.totalMillions;

  // Weekly = sum of last 5 trading days (rows are trading days, no weekends)
  const weeklyEntries = sorted.slice(0, 5);
  const weeklyM = weeklyEntries.reduce((s, r) => s + r.totalMillions, 0);

  const trend = (() => {
    const avg = weeklyM / Math.max(1, weeklyEntries.length);
    if (dailyM > 0 && weeklyM > 0) {
      if (dailyM > avg * 1.3) return "accelerating";
      if (dailyM < avg * 0.5) return "slowing";
      return "positive";
    }
    if (dailyM < 0 && weeklyM < 0) return "negative";
    return "mixed";
  })();

  return {
    date: latest.date,
    daily_millions: dailyM,
    weekly_millions: weeklyM,
    trend,
    source: "farside",
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    console.log("Fetching Farside ETF flow data...");
    const html = await fetchFarside();

    const rows = parseFarside(html);
    if (rows.length === 0) throw new Error("No rows parsed from Farside");
    console.log(`Parsed ${rows.length} ETF flow rows`);

    const record = buildFlowsRecord(rows);
    console.log(`Latest: ${record.date} | daily=${record.daily_millions}M | weekly=${record.weekly_millions}M | trend=${record.trend}`);

    // Check if already up to date
    const { data: existing } = await supabase
      .from("etf_flows")
      .select("id")
      .eq("date", record.date)
      .single();

    if (existing) {
      // Update in case the value changed (Farside sometimes revises intraday)
      const { error } = await supabase
        .from("etf_flows")
        .update({
          daily_millions: record.daily_millions,
          weekly_millions: record.weekly_millions,
          trend: record.trend,
          source: record.source,
        })
        .eq("date", record.date);
      if (error) throw new Error(`Update failed: ${error.message}`);
      console.log(`Updated existing row for ${record.date}`);
    } else {
      const { error } = await supabase.from("etf_flows").insert(record);
      if (error) throw new Error(`Insert failed: ${error.message}`);
      console.log(`Inserted new row for ${record.date}`);
    }

    return Response.json({
      ok: true,
      date: record.date,
      daily_millions: record.daily_millions,
      weekly_millions: record.weekly_millions,
      trend: record.trend,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("etf-updater error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
