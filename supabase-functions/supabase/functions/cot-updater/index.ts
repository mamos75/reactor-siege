// cot-updater — Chain Reactors Trader
// Fetches CFTC COT report for Bitcoin CME futures, parses positions,
// detects bias flips, and writes to Supabase cot_reports + cot_flip_alerts.
// Called by pg_cron every Friday at 17:30 UTC (after CFTC publishes).
// Can also be triggered manually via POST for backfill.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// CFTC Disaggregated Futures Only (FinFutWk.txt) — Bitcoin CME
const CFTC_URL = "https://www.cftc.gov/dea/newcot/FinFutWk.txt";

// Column indices in the CFTC CSV (Disaggregated report)
// Format: name, as_of_date_in_form_yymmdd, report_date_as_yyyy_mm_dd, ...
// positions start at index 7
// See: https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm
const COL = {
  date: 2,
  openInterest: 7,
  dealerLong: 8,
  dealerShort: 9,
  assetMgrLong: 10,
  assetMgrShort: 11,
  levFundsLong: 12,
  levFundsShort: 13,
  otherLong: 14,
  otherShort: 15,
};

function determineBias(net: number): string {
  if (net > 10000) return "FORT HAUSSIER";
  if (net > 1000)  return "HAUSSIER";
  if (net < -10000) return "FORT BAISSIER";
  if (net < -1000)  return "BAISSIER";
  return "NEUTRE";
}

async function fetchCFTC(): Promise<string> {
  const res = await fetch(CFTC_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/plain,text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`CFTC fetch failed: ${res.status}`);
  return res.text();
}

function parseCOT(text: string) {
  const lines = text.split("\n");
  const btcLine = lines.find(
    (l) => l.includes("BITCOIN") && l.includes("CME")
  );
  if (!btcLine) throw new Error("Bitcoin CME line not found in CFTC data");

  const p = btcLine.split(",");
  const parse = (i: number) => parseInt(p[i]?.trim() ?? "0") || 0;

  const reportDate   = p[COL.date]?.trim() ?? "";         // "2026-04-15"
  const openInterest = parse(COL.openInterest);
  const dealerLong   = parse(COL.dealerLong);
  const dealerShort  = parse(COL.dealerShort);
  const assetMgrLong = parse(COL.assetMgrLong);
  const assetMgrShort = parse(COL.assetMgrShort);
  const levFundsLong  = parse(COL.levFundsLong);
  const levFundsShort = parse(COL.levFundsShort);
  const otherLong     = parse(COL.otherLong);
  const otherShort    = parse(COL.otherShort);

  const institutionsNet = assetMgrLong - assetMgrShort;
  const hedgeFundNet    = levFundsLong  - levFundsShort;
  const dealerNet       = dealerLong   - dealerShort;
  const retailNet       = otherLong    - otherShort;

  return {
    report_date: reportDate,
    asset: "BTC",
    open_interest: openInterest,
    // Commercials (Dealers)
    commercials_long: dealerLong,
    commercials_short: dealerShort,
    // Asset Managers / Institutions
    asset_manager_long: assetMgrLong,
    asset_manager_short: assetMgrShort,
    // Leveraged Funds / Hedge Funds
    leveraged_long: levFundsLong,
    leveraged_short: levFundsShort,
    // Other / Retail
    retail_long: otherLong,
    retail_short: otherShort,
    // Derived nets & bias
    institutions_bias: determineBias(institutionsNet),
    hedge_fund_bias: determineBias(hedgeFundNet),
  };
}

async function detectAndSaveFlip(current: ReturnType<typeof parseCOT>) {
  // Get previous report to detect flips
  const { data: prev } = await supabase
    .from("cot_reports")
    .select("institutions_bias, hedge_fund_bias, asset_manager_long, asset_manager_short, leveraged_long, leveraged_short")
    .eq("asset", "BTC")
    .order("report_date", { ascending: false })
    .limit(1)
    .single();

  if (!prev) return; // No previous data, no flip detection

  const flips = [];

  // Check institutions flip
  if (prev.institutions_bias !== current.institutions_bias) {
    const institutionsNet = current.asset_manager_long - current.asset_manager_short;
    const prevNet = prev.asset_manager_long - prev.asset_manager_short;
    flips.push({
      asset: "BTC",
      category: "Institutions",
      from_bias: prev.institutions_bias,
      to_bias: current.institutions_bias,
      magnitude: Math.abs(institutionsNet - prevNet),
      detected_at: new Date().toISOString(),
    });
  }

  // Check hedge fund flip
  if (prev.hedge_fund_bias !== current.hedge_fund_bias) {
    const hedgeFundNet = current.leveraged_long - current.leveraged_short;
    const prevNet = prev.leveraged_long - prev.leveraged_short;
    flips.push({
      asset: "BTC",
      category: "Hedge Funds",
      from_bias: prev.hedge_fund_bias,
      to_bias: current.hedge_fund_bias,
      magnitude: Math.abs(hedgeFundNet - prevNet),
      detected_at: new Date().toISOString(),
    });
  }

  if (flips.length > 0) {
    const { error } = await supabase.from("cot_flip_alerts").insert(flips);
    if (error) console.error("flip insert error:", error.message);
    else console.log(`Saved ${flips.length} flip(s):`, flips.map(f => `${f.category}: ${f.from_bias} → ${f.to_bias}`).join(", "));
  }
}

Deno.serve(async (req) => {
  // Allow GET (for pg_cron via HTTP) and POST (manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    console.log("Fetching CFTC COT data...");
    const text = await fetchCFTC();

    const cotData = parseCOT(text);
    console.log(`Parsed COT: ${cotData.report_date}, institutions ${cotData.institutions_bias}, HF ${cotData.hedge_fund_bias}`);

    // Check if this report date already exists
    const { data: existing } = await supabase
      .from("cot_reports")
      .select("id")
      .eq("report_date", cotData.report_date)
      .eq("asset", "BTC")
      .single();

    if (existing) {
      console.log(`Report for ${cotData.report_date} already exists, skipping.`);
      return Response.json({ ok: true, message: "already up to date", date: cotData.report_date });
    }

    // Detect flip before inserting
    await detectAndSaveFlip(cotData);

    // Insert new COT report
    const { error } = await supabase.from("cot_reports").insert(cotData);
    if (error) throw new Error(`Insert failed: ${error.message}`);

    console.log(`COT report saved for ${cotData.report_date}`);
    return Response.json({ ok: true, date: cotData.report_date, institutions: cotData.institutions_bias, hedgeFunds: cotData.hedge_fund_bias });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("cot-updater error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
