import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Réimplémentation exacte de la logique de etf-updater/index.ts

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[2]];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function parseNumber(raw: string): number | null {
  const s = raw.replace(/,/g, "").trim();
  if (s === "" || s === "-" || s.toLowerCase() === "n/a") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// buildFlowsRecord simplifié : calcule le trend à partir des flux journaliers
interface FlowsRecord {
  ticker: string;
  date: string;
  dailyFlow: number | null;
  avgFlow: number | null;
  trend: string;
}

function buildFlowsRecord(
  ticker: string,
  date: string,
  dailyFlows: number[],
): FlowsRecord {
  const validFlows = dailyFlows.filter((f) => !isNaN(f));
  const dailyM = validFlows.length > 0 ? validFlows[0] : null;
  const avgFlow =
    validFlows.length > 0
      ? validFlows.reduce((a, b) => a + b, 0) / validFlows.length
      : null;

  let trend = "stable";
  if (dailyM !== null && avgFlow !== null) {
    if (dailyM > avgFlow * 1.3) {
      trend = "accelerating";
    } else if (dailyM < 0 && avgFlow < 0) {
      trend = "negative";
    }
  }

  return { ticker, date, dailyFlow: dailyM, avgFlow, trend };
}

// -----------------------------------------------------------------------
// Tests parseDate
// -----------------------------------------------------------------------

Deno.test("parseDate: '18 Apr 2026' → '2026-04-18'", () => {
  assertEquals(parseDate("18 Apr 2026"), "2026-04-18");
});

Deno.test("parseDate: '1 Jan 2024' → '2024-01-01' (padding un chiffre)", () => {
  assertEquals(parseDate("1 Jan 2024"), "2024-01-01");
});

Deno.test("parseDate: '31 Dec 2025' → '2025-12-31'", () => {
  assertEquals(parseDate("31 Dec 2025"), "2025-12-31");
});

Deno.test("parseDate: format invalide (ISO) → null", () => {
  assertEquals(parseDate("2026-04-18"), null);
});

Deno.test("parseDate: format invalide (vide) → null", () => {
  assertEquals(parseDate(""), null);
});

Deno.test("parseDate: mois inconnu → null", () => {
  assertEquals(parseDate("18 Xyz 2026"), null);
});

Deno.test("parseDate: format invalide (chiffres seuls) → null", () => {
  assertEquals(parseDate("18042026"), null);
});

Deno.test("parseDate: espaces en début/fin (trim) → résultat valide", () => {
  assertEquals(parseDate("  5 Mar 2025  "), "2025-03-05");
});

// -----------------------------------------------------------------------
// Tests parseNumber
// -----------------------------------------------------------------------

Deno.test("parseNumber: '-123.4' → -123.4", () => {
  assertEquals(parseNumber("-123.4"), -123.4);
});

Deno.test("parseNumber: 'N/A' → null", () => {
  assertEquals(parseNumber("N/A"), null);
});

Deno.test("parseNumber: 'n/a' (minuscules) → null", () => {
  assertEquals(parseNumber("n/a"), null);
});

Deno.test("parseNumber: '' (vide) → null", () => {
  assertEquals(parseNumber(""), null);
});

Deno.test("parseNumber: '-' → null", () => {
  assertEquals(parseNumber("-"), null);
});

Deno.test("parseNumber: '1,234.56' (virgules) → 1234.56", () => {
  assertEquals(parseNumber("1,234.56"), 1234.56);
});

Deno.test("parseNumber: '0' → 0", () => {
  assertEquals(parseNumber("0"), 0);
});

Deno.test("parseNumber: '   42.0   ' (espaces) → 42", () => {
  assertEquals(parseNumber("   42.0   "), 42.0);
});

Deno.test("parseNumber: texte non numérique → null", () => {
  assertEquals(parseNumber("abc"), null);
});

// -----------------------------------------------------------------------
// Tests buildFlowsRecord
// -----------------------------------------------------------------------

Deno.test("buildFlowsRecord: trend 'accelerating' si dailyFlow > avg * 1.3", () => {
  // dailyFlow = 200, avg = (200 + 100 + 100) / 3 ≈ 133.3
  // 200 > 133.3 * 1.3 ≈ 173.3 → accelerating
  const result = buildFlowsRecord("BTC", "2026-04-18", [200, 100, 100]);
  assertEquals(result.trend, "accelerating");
  assertEquals(result.ticker, "BTC");
  assertEquals(result.date, "2026-04-18");
});

Deno.test("buildFlowsRecord: trend 'negative' si tout négatif", () => {
  // dailyFlow = -50, avg = (-50 + -30 + -20) / 3 = -33.3
  // -50 < 0 && -33.3 < 0 → negative (et -50 n'est pas > -33.3 * 1.3 = -43.3)
  const result = buildFlowsRecord("ETH", "2026-04-18", [-50, -30, -20]);
  assertEquals(result.trend, "negative");
});

Deno.test("buildFlowsRecord: trend 'stable' pour flux normaux mixtes", () => {
  // dailyFlow = 50, avg = (50 + 60 + 55) / 3 ≈ 55
  // 50 < 55 * 1.3 = 71.5 && pas tout négatif → stable
  const result = buildFlowsRecord("BTC", "2026-04-18", [50, 60, 55]);
  assertEquals(result.trend, "stable");
});

Deno.test("buildFlowsRecord: dailyFlow est le premier élément du tableau", () => {
  const result = buildFlowsRecord("ETH", "2026-04-18", [999, 10, 10]);
  assertEquals(result.dailyFlow, 999);
});

Deno.test("buildFlowsRecord: avgFlow correctement calculé", () => {
  // avg = (10 + 20 + 30) / 3 = 20
  const result = buildFlowsRecord("BTC", "2026-04-18", [10, 20, 30]);
  assertEquals(result.avgFlow, 20);
});
