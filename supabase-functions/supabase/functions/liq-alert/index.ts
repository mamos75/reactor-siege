// liq-alert — Chain Reactors Trader
// Scans real_liquidation_events for large events (>= $50M) not yet notified.
// Sends APNs push to all registered devices.
// Called by pg_cron every 2 minutes.
//
// Supabase secrets required:
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID_TRADER, APNS_PRIVATE_KEY, APNS_PRODUCTION

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

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

// Threshold in USD
const LIQ_THRESHOLD_USD = 50_000_000;  // $50M

// ── APNs JWT (cached 55min) ────────────────────────────────────────────────

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

// ── Send one APNs push ────────────────────────────────────────────────────

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
    type: "liq_alert",
    ...extra,
  };

  const res = await fetch(`${APNS_HOST}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
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

// ── Helpers ───────────────────────────────────────────────────────────────

function formatUSD(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  return `$${(usd / 1_000_000).toFixed(0)}M`;
}

function sideEmoji(side: string, sizeUsd: number): string {
  const isMassive = sizeUsd >= 100_000_000;
  if (side === "long") return isMassive ? "🔴💥" : "🔴";
  return isMassive ? "🟢💥" : "🟢";
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Find large liquidation events not yet notified (last 10 minutes window)
  const since = new Date(Date.now() - 10 * 60 * 1000).getTime(); // 10min ago in ms

  const { data: events, error: evErr } = await supabase
    .from("real_liquidation_events")
    .select("id, coin, side, price_usd, size_usd, timestamp_ms")
    .gte("size_usd", LIQ_THRESHOLD_USD)
    .gte("timestamp_ms", since)
    .is("notified_at", null)
    .order("size_usd", { ascending: false })
    .limit(10);

  if (evErr) {
    return Response.json({ error: evErr.message }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return Response.json({ message: "No large liquidations to notify", since: new Date(since).toISOString() });
  }

  // 2. Get push tokens for users who have notif_liq_alert enabled
  //    LEFT JOIN with notification_preferences: default true if no row exists (opt-in by default)
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token, user_id, notification_preferences!left(notif_liq_alert)")
    .or("notification_preferences.notif_liq_alert.is.null,notification_preferences.notif_liq_alert.eq.true");

  if (!tokens || tokens.length === 0) {
    return Response.json({ message: "No push tokens registered for liq alerts", events: events.length });
  }

  const pushResults: unknown[] = [];

  for (const event of events) {
    const sizeFormatted = formatUSD(event.size_usd);
    const emoji         = sideEmoji(event.side, event.size_usd);
    const sideLabel     = event.side === "long" ? "LONG liquidé" : "SHORT liquidé";
    const priceStr      = `$${Number(event.price_usd).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

    const title = `${emoji} ${event.coin} — ${sizeFormatted} ${sideLabel}`;
    const body  = `Prix : ${priceStr} · Hyperliquid`;

    const extra = {
      coin:      event.coin,
      side:      event.side,
      size_usd:  event.size_usd,
      price_usd: event.price_usd,
    };

    // Send to all devices
    for (const { token } of tokens as { token: string }[]) {
      const result = await sendApns(token, title, body, extra);
      pushResults.push({ eventId: event.id, token: token.slice(0, 8) + "…", ...result });
    }

    // Mark as notified
    await supabase
      .from("real_liquidation_events")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", event.id);
  }

  return Response.json({
    ok: true,
    eventsProcessed: events.length,
    pushResults,
    timestamp: new Date().toISOString(),
  });
});
