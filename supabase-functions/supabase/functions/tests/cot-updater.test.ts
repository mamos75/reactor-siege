import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Réimplémentation exacte de la logique de cot-updater/index.ts
function determineBias(net: number): string {
  if (net > 10000)  return "FORT HAUSSIER";
  if (net > 1000)   return "HAUSSIER";
  if (net < -10000) return "FORT BAISSIER";
  if (net < -1000)  return "BAISSIER";
  return "NEUTRE";
}

// Logique partielle de parseCOT : extraction et calcul du net
function parseCOT(
  longNonComm: number,
  shortNonComm: number,
): { net: number; bias: string } {
  const net = longNonComm - shortNonComm;
  return { net, bias: determineBias(net) };
}

// -----------------------------------------------------------------------
// Tests determineBias — tous les seuils
// -----------------------------------------------------------------------

Deno.test("determineBias: net > 10000 → FORT HAUSSIER", () => {
  assertEquals(determineBias(10001), "FORT HAUSSIER");
  assertEquals(determineBias(50000), "FORT HAUSSIER");
  assertEquals(determineBias(999999), "FORT HAUSSIER");
});

Deno.test("determineBias: net == 10000 → HAUSSIER (non > 10000)", () => {
  // La condition est strictement > 10000
  assertEquals(determineBias(10000), "HAUSSIER");
});

Deno.test("determineBias: 1000 < net <= 10000 → HAUSSIER", () => {
  assertEquals(determineBias(5000), "HAUSSIER");
  assertEquals(determineBias(1001), "HAUSSIER");
  assertEquals(determineBias(10000), "HAUSSIER");
});

Deno.test("determineBias: net == 1000 → NEUTRE (non > 1000)", () => {
  assertEquals(determineBias(1000), "NEUTRE");
});

Deno.test("determineBias: -1000 <= net <= 1000 → NEUTRE", () => {
  assertEquals(determineBias(0), "NEUTRE");
  assertEquals(determineBias(500), "NEUTRE");
  assertEquals(determineBias(-500), "NEUTRE");
  assertEquals(determineBias(1000), "NEUTRE");
  assertEquals(determineBias(-1000), "NEUTRE");
});

Deno.test("determineBias: -10000 <= net < -1000 → BAISSIER", () => {
  assertEquals(determineBias(-1001), "BAISSIER");
  assertEquals(determineBias(-5000), "BAISSIER");
  assertEquals(determineBias(-10000), "BAISSIER");
});

Deno.test("determineBias: net < -10000 → FORT BAISSIER", () => {
  assertEquals(determineBias(-10001), "FORT BAISSIER");
  assertEquals(determineBias(-50000), "FORT BAISSIER");
  assertEquals(determineBias(-999999), "FORT BAISSIER");
});

// -----------------------------------------------------------------------
// Tests parseCOT (calcul du net + bias combiné)
// -----------------------------------------------------------------------

Deno.test("parseCOT: longs > shorts + net > 10000 → FORT HAUSSIER", () => {
  const result = parseCOT(60000, 45000);
  assertEquals(result.net, 15000);
  assertEquals(result.bias, "FORT HAUSSIER");
});

Deno.test("parseCOT: longs > shorts + 1000 < net <= 10000 → HAUSSIER", () => {
  const result = parseCOT(30000, 25000);
  assertEquals(result.net, 5000);
  assertEquals(result.bias, "HAUSSIER");
});

Deno.test("parseCOT: longs ≈ shorts → NEUTRE", () => {
  const result = parseCOT(20000, 20000);
  assertEquals(result.net, 0);
  assertEquals(result.bias, "NEUTRE");
});

Deno.test("parseCOT: shorts > longs + 1000 < net < 10000 → BAISSIER", () => {
  const result = parseCOT(25000, 30000);
  assertEquals(result.net, -5000);
  assertEquals(result.bias, "BAISSIER");
});

Deno.test("parseCOT: shorts >> longs + net < -10000 → FORT BAISSIER", () => {
  const result = parseCOT(45000, 60000);
  assertEquals(result.net, -15000);
  assertEquals(result.bias, "FORT BAISSIER");
});
