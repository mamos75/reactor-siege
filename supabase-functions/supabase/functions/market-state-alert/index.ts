// market-state-alert — Chain Reactors Trader
// Lit derived_market_states (dernière ligne) + market_state_snapshots (tendance).
// Compare avec l'état précédent. Si trigger → APNs push à tous les devices.
// Appelé par pg_cron toutes les 20min.
//
// Triggers (mêmes que Layer 1 iOS) :
//   1. Setup critique    : squeezeSetup | flushSetup, confidence != low   → cooldown 2h
//   2. Transition        : state_name différent du précédent               → cooldown 1h
//   3. Conviction high   : confidence = high, hors neutralStructure        → cooldown 3h
//   4. Cleanup / Rebuild : southCleanup|northCleanup|rebuildNorth|rebuildSouth, confidence != low → cooldown 2h
//
// Cooldowns gérés dans la table market_alert_cooldowns (upsert par alert_type).
// Secrets requis :
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID_TRADER, APNS_PRIVATE_KEY, APNS_PRODUCTION

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// ── Env ────────────────────────────────────────────────────────────────────

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APNS_KEY_ID         = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID        = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID      = Deno.env.get("APNS_BUNDLE_ID_TRADER") ?? "";
const APNS_PRIVATE_KEY    = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_PRODUCTION     = Deno.env.get("APNS_PRODUCTION") === "true";
const APNS_HOST           = APNS_PRODUCTION
  ? "https://api.push.apple.com"
  : "https://api.sandbox.push.apple.com";

// ── Cooldowns (secondes) ───────────────────────────────────────────────────

const COOLDOWNS: Record<string, number> = {
  critical_setup:   2 * 3600,   // 2h
  state_transition: 1 * 3600,   // 1h
  high_conviction:  3 * 3600,   // 3h
  cleanup_rebuild:  2 * 3600,   // 2h
};

const CRITICAL_LABELS   = new Set(["squeezeSetup", "flushSetup"]);
const CLEANUP_LABELS    = new Set(["southCleanup", "northCleanup", "rebuildNorth", "rebuildSouth"]);

// ── Label metadata ─────────────────────────────────────────────────────────

const LABEL_META: Record<string, { emoji: string; displayName: string }> = {
  squeezeSetup:          { emoji: "🚀", displayName: "Squeeze Setup" },
  flushSetup:            { emoji: "🔻", displayName: "Flush Setup" },
  buildingShortPressure: { emoji: "🔼", displayName: "Building Short Pressure" },
  buildingLongPressure:  { emoji: "🔽", displayName: "Building Long Pressure" },
  southCleanup:          { emoji: "🧹", displayName: "South Cleanup" },
  northCleanup:          { emoji: "🧹", displayName: "North Cleanup" },
  rebuildNorth:          { emoji: "🔄", displayName: "Rebuild North" },
  rebuildSouth:          { emoji: "🔄", displayName: "Rebuild South" },
  twoSidedTrap:          { emoji: "🪤", displayName: "Two-Sided Trap" },
  neutralStructure:      { emoji: "😐", displayName: "Neutral Structure" },
};

// ── APNs JWT (cached) ──────────────────────────────────────────────────────

let cachedJwt: { token: string; exp: number } | null = null;

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp > now + 300) return cachedJwt.token;

  const pemBody = APNS_PRIVATE_KEY
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"],
  );

  const token = await create(
    { alg: "ES256", kid: APNS_KEY_ID },
    { iss: APNS_TEAM_ID, iat: getNumericDate(0) },
    privateKey,
  );

  cachedJwt = { token, exp: now + 3600 };
  return token;
}

async function sendApns(
  deviceToken: string,
  title: string,
  body: string,
  extra: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_BUNDLE_ID || !APNS_PRIVATE_KEY) {
    return { ok: false, status: 0, reason: "APNs not configured" };
  }

  const jwt = await getApnsJwt();
  const payload = {
    aps: { alert: { title, body }, sound: "default", badge: 1 },
    type: "market_state",
    ...extra,
  };

  const res = await fetch(`${APNS_HOST}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization:    `bearer ${jwt}`,
      "apns-topic":     APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority":  "10",
      "content-type":   "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { reason?: string };
    return { ok: false, status: res.status, reason: err.reason };
  }
  return { ok: true, status: res.status };
}

// ── Cooldown helpers ───────────────────────────────────────────────────────

async function canFire(
  supabase: ReturnType<typeof createClient>,
  alertType: string,
): Promise<boolean> {
  const cooldownSecs = COOLDOWNS[alertType] ?? 3600;
  const { data } = await supabase
    .from("market_alert_cooldowns")
    .select("last_fired_at")
    .eq("alert_type", alertType)
    .eq("symbol", "BTCUSDT")
    .single();

  if (!data?.last_fired_at) return true;
  const lastFire = new Date(data.last_fired_at).getTime();
  return (Date.now() - lastFire) >= cooldownSecs * 1000;
}

async function markFired(
  supabase: ReturnType<typeof createClient>,
  alertType: string,
): Promise<void> {
  await supabase
    .from("market_alert_cooldowns")
    .upsert(
      { alert_type: alertType, symbol: "BTCUSDT", last_fired_at: new Date().toISOString() },
      { onConflict: "alert_type,symbol" },
    );
}

// Mapping alert_type → colonne notification_preferences
// critical_setup / cleanup_rebuild → notif_liq_alert (événement marché urgent)
// state_transition / high_conviction → notif_cot_flip (signal directionnel)
const ALERT_PREF_COL: Record<string, string> = {
  critical_setup:   "notif_liq_alert",
  cleanup_rebuild:  "notif_liq_alert",
  state_transition: "notif_cot_flip",
  high_conviction:  "notif_cot_flip",
};

// ── Push to subscribed tokens ──────────────────────────────────────────────

async function pushToSubscribed(
  supabase: ReturnType<typeof createClient>,
  alertType: string,
  title: string,
  body: string,
  extra: Record<string, unknown>,
): Promise<unknown[]> {
  const prefCol = ALERT_PREF_COL[alertType] ?? "notif_liq_alert";

  // Jointure LEFT avec notification_preferences :
  // - pas de ligne → opt-in par défaut (null = true)
  // - ligne avec colonne = false → exclu
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select(`token, user_id, notification_preferences!left(${prefCol})`)
    .or(`notification_preferences.${prefCol}.is.null,notification_preferences.${prefCol}.eq.true`);

  if (!tokens || tokens.length === 0) return [];

  const results: unknown[] = [];
  const staleTokens: string[] = [];

  for (const { token } of tokens as { token: string }[]) {
    const result = await sendApns(token, title, body, extra);
    results.push({ token: token.slice(0, 8) + "…", ...result });
    // 410 = Unregistered — token invalide, à supprimer
    if (result.status === 410) staleTokens.push(token);
  }

  // Cleanup silencieux des tokens périmés
  if (staleTokens.length > 0) {
    await supabase.from("push_tokens").delete().in("token", staleTokens);
  }

  return results;
}

// ── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Lire les 2 dernières lignes de derived_market_states (symbol BTCUSDT)
  const { data: rows, error: rowsErr } = await supabase
    .from("derived_market_states")
    .select("id, state_name, confidence, transition_from, narrative, timestamp")
    .eq("symbol", "BTCUSDT")
    .order("created_at", { ascending: false })
    .limit(2);

  if (rowsErr) {
    return Response.json({ error: rowsErr.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return Response.json({ message: "No derived market state found" });
  }

  const current  = rows[0] as {
    id: string;
    state_name: string;
    confidence: string;
    transition_from: string | null;
    narrative: string;
    timestamp: string;
  };
  const previous = rows[1] as typeof current | undefined;

  const meta      = LABEL_META[current.state_name] ?? { emoji: "📊", displayName: current.state_name };
  const pushResults: unknown[] = [];
  let alertType: string | null = null;
  let title = "";
  let body  = current.narrative;

  // 2. Évaluer les triggers par priorité

  // Priority 1 — Setup critique
  if (
    CRITICAL_LABELS.has(current.state_name) &&
    current.confidence !== "low" &&
    await canFire(supabase, "critical_setup")
  ) {
    alertType = "critical_setup";
    title     = `${meta.emoji} ${meta.displayName}`;
  }

  // Priority 2 — Transition d'état
  else if (
    previous &&
    current.state_name !== previous.state_name &&
    await canFire(supabase, "state_transition")
  ) {
    const prevMeta = LABEL_META[previous.state_name] ?? { emoji: "📊", displayName: previous.state_name };
    alertType = "state_transition";
    title     = `🔄 ${prevMeta.displayName} → ${meta.displayName}`;
  }

  // Priority 3 — Conviction high (hors neutral)
  else if (
    current.confidence === "high" &&
    current.state_name !== "neutralStructure" &&
    await canFire(supabase, "high_conviction")
  ) {
    alertType = "high_conviction";
    title     = `${meta.emoji} Conviction élevée — ${meta.displayName}`;
  }

  // Priority 4 — Cleanup / Rebuild
  else if (
    CLEANUP_LABELS.has(current.state_name) &&
    current.confidence !== "low" &&
    await canFire(supabase, "cleanup_rebuild")
  ) {
    alertType = "cleanup_rebuild";
    title     = `${meta.emoji} ${meta.displayName}`;
  }

  // 3. Envoyer si trigger détecté — uniquement aux users abonnés au type d'alerte
  if (alertType) {
    const results = await pushToSubscribed(supabase, alertType, title, body, {
      state: current.state_name,
      confidence: current.confidence,
      alert_type: alertType,
    });
    pushResults.push(...results);
    await markFired(supabase, alertType);
  }

  return Response.json({
    ok: true,
    currentState: current.state_name,
    confidence: current.confidence,
    alertType,
    pushCount: pushResults.length,
    pushResults,
    timestamp: new Date().toISOString(),
  });
});
