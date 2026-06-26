import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Réimplémentation exacte de la logique de mtc-checker/index.ts
function calcMTC(closes: number[]): { gap: number; ma16: number; ma50: number; color: string } {
  if (closes.length < 50) {
    throw new Error(`Not enough data: need 50 candles, got ${closes.length}`);
  }
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

// Fabrique un tableau de 50 closes à partir d'une valeur de base.
// On choisit les 16 premières et les 50 au total pour que le gap calculé
// corresponde à la valeur souhaitée.
function makeCloses(ma16Target: number, ma50Target: number): number[] {
  // 50 valeurs où les 16 premières valent ma16Target et le reste complète ma50Target
  const first16 = Array(16).fill(ma16Target);
  // sum50 = 16*ma16Target + 34*x  =>  x = (50*ma50Target - 16*ma16Target) / 34
  const remaining = (50 * ma50Target - 16 * ma16Target) / 34;
  const last34 = Array(34).fill(remaining);
  return [...first16, ...last34];
}

// -----------------------------------------------------------------------
// Test : gap < 20 → "red"
// gap = |ma16 - ma50*2| / (ma50*2) * 100
// Choisissons ma50 = 100, ma16 = 195  → gap = |195 - 200| / 200 * 100 = 2.5 %
// -----------------------------------------------------------------------
Deno.test("calcMTC: gap < 20 → color = red", () => {
  const closes = makeCloses(195, 100);
  const result = calcMTC(closes);
  assertEquals(result.color, "red");
  // Vérifie que le gap est bien < 20
  assertEquals(result.gap < 20, true);
});

// -----------------------------------------------------------------------
// Test : gap entre 20 et 42 → "blue"
// ma50 = 100, ma16 = 160  → gap = |160 - 200| / 200 * 100 = 20 %
// -----------------------------------------------------------------------
Deno.test("calcMTC: 20 <= gap < 42 → color = blue", () => {
  const closes = makeCloses(160, 100);
  const result = calcMTC(closes);
  assertEquals(result.color, "blue");
  assertEquals(result.gap >= 20 && result.gap < 42, true);
});

// -----------------------------------------------------------------------
// Test : gap entre 42 et 65 → "yellow"
// ma50 = 100, ma16 = 100  → gap = |100 - 200| / 200 * 100 = 50 %
// -----------------------------------------------------------------------
Deno.test("calcMTC: 42 <= gap < 65 → color = yellow", () => {
  const closes = makeCloses(100, 100);
  const result = calcMTC(closes);
  assertEquals(result.color, "yellow");
  assertEquals(result.gap >= 42 && result.gap < 65, true);
});

// -----------------------------------------------------------------------
// Test : gap >= 65 → "green"
// ma50 = 100, ma16 = 0  → gap = |0 - 200| / 200 * 100 = 100 %
// -----------------------------------------------------------------------
Deno.test("calcMTC: gap >= 65 → color = green", () => {
  const closes = makeCloses(0, 100);
  const result = calcMTC(closes);
  assertEquals(result.color, "green");
  assertEquals(result.gap >= 65, true);
});

// -----------------------------------------------------------------------
// Test : tableau < 50 éléments → erreur
// -----------------------------------------------------------------------
Deno.test("calcMTC: tableau < 50 éléments → throw Error", () => {
  assertThrows(
    () => calcMTC(Array(49).fill(100)),
    Error,
    "Not enough data",
  );
});

// -----------------------------------------------------------------------
// Test : tableau exactement vide → erreur
// -----------------------------------------------------------------------
Deno.test("calcMTC: tableau vide → throw Error", () => {
  assertThrows(
    () => calcMTC([]),
    Error,
    "Not enough data",
  );
});

// -----------------------------------------------------------------------
// Test : valeurs numériques de ma16 et ma50 correctes
// -----------------------------------------------------------------------
Deno.test("calcMTC: ma16 et ma50 correctement calculées", () => {
  const closes = Array(50).fill(100);
  const result = calcMTC(closes);
  assertEquals(result.ma16, 100);
  assertEquals(result.ma50, 100);
});
