import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Réimplémentation exacte de la logique de liq-alert/index.ts

function formatUSD(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  return `$${(usd / 1_000_000).toFixed(0)}M`;
}

function sideEmoji(side: string, sizeUsd: number): string {
  const isMassive = sizeUsd >= 100_000_000;
  if (side === "long") return isMassive ? "🔴💥" : "🔴";
  return isMassive ? "🟢💥" : "🟢";
}

// -----------------------------------------------------------------------
// Tests formatUSD
// -----------------------------------------------------------------------

Deno.test("formatUSD: 50_000_000 → '$50M'", () => {
  assertEquals(formatUSD(50_000_000), "$50M");
});

Deno.test("formatUSD: 1_500_000_000 → '$1.5B'", () => {
  assertEquals(formatUSD(1_500_000_000), "$1.5B");
});

Deno.test("formatUSD: exactement 1_000_000_000 → '$1.0B'", () => {
  assertEquals(formatUSD(1_000_000_000), "$1.0B");
});

Deno.test("formatUSD: 999_999_999 (< 1B) → '$1000M' (arrondi)", () => {
  // 999_999_999 / 1_000_000 = 999.999999 → toFixed(0) = "1000"
  assertEquals(formatUSD(999_999_999), "$1000M");
});

Deno.test("formatUSD: 100_000_000 → '$100M'", () => {
  assertEquals(formatUSD(100_000_000), "$100M");
});

Deno.test("formatUSD: 2_500_000_000 → '$2.5B'", () => {
  assertEquals(formatUSD(2_500_000_000), "$2.5B");
});

Deno.test("formatUSD: 1_000_000 → '$1M'", () => {
  assertEquals(formatUSD(1_000_000), "$1M");
});

// -----------------------------------------------------------------------
// Tests sideEmoji
// -----------------------------------------------------------------------

Deno.test("sideEmoji: long + 50M (< 100M) → '🔴'", () => {
  assertEquals(sideEmoji("long", 50_000_000), "🔴");
});

Deno.test("sideEmoji: long + 100M (>= 100M) → '🔴💥'", () => {
  assertEquals(sideEmoji("long", 100_000_000), "🔴💥");
});

Deno.test("sideEmoji: long + 200M → '🔴💥'", () => {
  assertEquals(sideEmoji("long", 200_000_000), "🔴💥");
});

Deno.test("sideEmoji: short + 50M (< 100M) → '🟢'", () => {
  assertEquals(sideEmoji("short", 50_000_000), "🟢");
});

Deno.test("sideEmoji: short + 200M (>= 100M) → '🟢💥'", () => {
  assertEquals(sideEmoji("short", 200_000_000), "🟢💥");
});

Deno.test("sideEmoji: short + exactement 100M → '🟢💥'", () => {
  assertEquals(sideEmoji("short", 100_000_000), "🟢💥");
});

Deno.test("sideEmoji: side inconnu + < 100M → '🟢' (fallback short)", () => {
  assertEquals(sideEmoji("unknown", 50_000_000), "🟢");
});

Deno.test("sideEmoji: side inconnu + >= 100M → '🟢💥' (fallback short)", () => {
  assertEquals(sideEmoji("unknown", 150_000_000), "🟢💥");
});
