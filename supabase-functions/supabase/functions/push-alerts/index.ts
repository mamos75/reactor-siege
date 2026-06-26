// push-alerts — Mamos Trend Color
// Compares latest signal with previous one per asset.
// If the zone changed, sends APNs push to subscribed users.
// Called by pg_cron right after mtc-checker runs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// APNs credentials — set these as Supabase secrets:
//   supabase secrets set APNS_KEY_ID=XXXXXXXXXX
//   supabase secrets set APNS_TEAM_ID=XXXXXXXXXX
//   supabase secrets set APNS_BUNDLE_ID=com.yourname.mamostools
//   supabase secrets set APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
const APNS_KEY_ID    = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID   = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";

// true = production APNs, false = sandbox (dev builds)
const APNS_PRODUCTION = Deno.env.get("APNS_PRODUCTION") === "true";
const APNS_HOST = APNS_PRODUCTION
  ? "https://api.push.apple.com"
  : "https://api.sandbox.push.apple.com";

// Zone display names per language
const ZONE_LABELS: Record<string, Record<string, string>> = {
  green:  { en: "ACCUMULATION 🟢", fr: "ACCUMULATION 🟢", es: "ACUMULACIÓN 🟢" },
  yellow: { en: "NEUTRAL 🟡",      fr: "NEUTRE 🟡",       es: "NEUTRAL 🟡" },
  blue:   { en: "TRANSITION 🔵",   fr: "TRANSITION 🔵",   es: "TRANSICIÓN 🔵" },
  red:    { en: "DANGER 🔴",       fr: "DANGER 🔴",       es: "PELIGRO 🔴" },
};

const COLOR_TO_NOTIFY_FIELD: Record<string, string> = {
  green:  "notify_green",
  yellow: "notify_yellow",
  blue:   "notify_blue",
  red:    "notify_red",
};

let cachedJwt: { token: string; exp: number } | null = null;

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Reuse token if still valid (APNs tokens are valid 1 hour)
  if (cachedJwt && cachedJwt.exp > now + 300) return cachedJwt.token;

  const pemBody = APNS_PRIVATE_KEY
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const exp = now + 3600;
  const token = await create(
    { alg: "ES256", kid: APNS_KEY_ID },
    { iss: APNS_TEAM_ID, iat: getNumericDate(0) },
    privateKey,
  );

  cachedJwt = { token, exp };
  return token;
}

async function sendApns(
  deviceToken: string,
  title: string,
  body: string,
  symbol: string,
  color: string,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_BUNDLE_ID || !APNS_PRIVATE_KEY) {
    return { ok: false, status: 0, reason: "APNs not configured" };
  }

  const jwt = await getApnsJwt();
  const url = `${APNS_HOST}/3/device/${deviceToken}`;

  const payload = {
    aps: {
      alert: { title, body },
      sound: "default",
      badge: 1,
    },
    symbol,
    color,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { reason?: string };
    return { ok: false, status: res.status, reason: err.reason };
  }
  return { ok: true, status: res.status };
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Find assets where the zone changed between the last two signals
  const { data: changes, error: changesErr } = await supabase.rpc("get_zone_changes");
  if (changesErr) {
    return new Response(
      JSON.stringify({ error: changesErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!changes || changes.length === 0) {
    return new Response(
      JSON.stringify({ message: "No zone changes", timestamp: new Date().toISOString() }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const pushResults: unknown[] = [];

  for (const change of changes as { symbol: string; prev_color: string; new_color: string }[]) {
    const { symbol, new_color } = change;
    const notifyField = COLOR_TO_NOTIFY_FIELD[new_color];
    if (!notifyField) continue;

    // 2. Find users who want alerts for this symbol + this color
    const { data: settings } = await supabase
      .from("alert_settings")
      .select("user_id")
      .eq("symbol", symbol)
      .eq("notify_on_change", true)
      .eq(notifyField, true);

    if (!settings || settings.length === 0) continue;

    const userIds = settings.map((s: { user_id: string }) => s.user_id);

    // 3. Get their push tokens
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", userIds);

    if (!tokens || tokens.length === 0) continue;

    // 4. Send push to each token
    const zoneLabel = ZONE_LABELS[new_color]?.en ?? new_color.toUpperCase();
    const title = `${symbol} — Zone changed`;
    const body = `Signal is now ${zoneLabel}`;

    for (const { token } of tokens as { user_id: string; token: string }[]) {
      const result = await sendApns(token, title, body, symbol, new_color);
      pushResults.push({ symbol, token: token.slice(0, 8) + "…", ...result });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      changes,
      pushResults,
      timestamp: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
