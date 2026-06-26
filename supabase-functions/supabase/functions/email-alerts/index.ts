// email-alerts — Mamos Trend Color
// Detects zone changes (via get_zone_changes RPC) and sends email alerts
// to users who have email notifications enabled for that symbol + zone.
//
// Deploy:
//   cd supabase-functions
//   supabase functions deploy email-alerts
//
// Secrets required:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
//
// Trigger: call this function right after push-alerts runs (pg_cron or Database Webhook).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY       = Deno.env.get("RESEND_API_KEY") ?? "";

// Sender — must be a verified domain in Resend
// Update to your actual verified domain once Resend is configured
const FROM_EMAIL = "MTC Alerts <alerts@mamoscrypto.com>";

// ─── Zone metadata ────────────────────────────────────────────────────────────

const ZONE_LABELS: Record<string, { en: string; fr: string; es: string }> = {
  green:  { en: "ACCUMULATION 🌿", fr: "ACCUMULATION 🌿", es: "ACUMULACIÓN 🌿" },
  yellow: { en: "NEUTRAL 😐",      fr: "NEUTRE 😐",       es: "NEUTRAL 😐"     },
  blue:   { en: "TRANSITION 🤔",   fr: "TRANSITION 🤔",   es: "TRANSICIÓN 🤔"  },
  red:    { en: "DANGER 🔴",       fr: "DANGER 🔴",       es: "PELIGRO 🔴"     },
};

const ZONE_ACTIONS: Record<string, { en: string; fr: string; es: string }> = {
  green:  { en: "Consider accumulating / DCA",    fr: "Envisagez d'accumuler / DCA", es: "Considere acumular / DCA"     },
  yellow: { en: "Hold / Be patient",              fr: "Conserver / Patienter",       es: "Mantener / Paciencia"         },
  blue:   { en: "Wait and observe",               fr: "Attendre et observer",        es: "Esperar y observar"           },
  red:    { en: "Take profits — danger zone",     fr: "Prendre ses profits — zone de danger", es: "Tomar ganancias — zona de peligro" },
};

const COLOR_TO_NOTIFY_FIELD: Record<string, string> = {
  green:  "notify_green",
  yellow: "notify_yellow",
  blue:   "notify_blue",
  red:    "notify_red",
};

const ZONE_BG_COLOR: Record<string, string> = {
  green:  "#064e3b",
  yellow: "#78350f",
  blue:   "#1e3a5f",
  red:    "#450a0a",
};

const ZONE_ACCENT: Record<string, string> = {
  green:  "#10b981",
  yellow: "#f59e0b",
  blue:   "#3b82f6",
  red:    "#ef4444",
};

// ─── Email HTML template ──────────────────────────────────────────────────────

function buildEmailHtml(
  symbol: string,
  prevColor: string,
  newColor: string,
  lang: string = "en",
): string {
  const l = (lang === "fr" || lang === "es") ? lang : "en";
  const newLabel  = ZONE_LABELS[newColor]?.[l]  ?? newColor.toUpperCase();
  const prevLabel = ZONE_LABELS[prevColor]?.[l] ?? prevColor.toUpperCase();
  const action    = ZONE_ACTIONS[newColor]?.[l]  ?? "";
  const accent    = ZONE_ACCENT[newColor]  ?? "#10b981";
  const bgZone    = ZONE_BG_COLOR[newColor] ?? "#09090b";

  const subject_en = `${symbol} zone changed → ${newLabel}`;
  const subject_fr = `${symbol} a changé de zone → ${newLabel}`;
  const subject_es = `${symbol} cambió de zona → ${newLabel}`;
  const _ = { en: subject_en, fr: subject_fr, es: subject_es };
  void _;

  const heading   = l === "fr" ? "Changement de zone MTC"
                  : l === "es" ? "Cambio de zona MTC"
                  : "MTC Zone Change";

  const subheading = l === "fr" ? `Le signal <strong>${symbol}</strong> a changé de zone.`
                   : l === "es" ? `La señal de <strong>${symbol}</strong> ha cambiado de zona.`
                   : `The <strong>${symbol}</strong> signal has changed zones.`;

  const fromLabel  = l === "fr" ? "De" : l === "es" ? "De" : "From";
  const toLabel    = l === "fr" ? "Vers" : l === "es" ? "A" : "To";
  const actionLabel = l === "fr" ? "Action suggérée" : l === "es" ? "Acción sugerida" : "Suggested action";

  const btnLabel   = l === "fr" ? "Voir le signal"
                   : l === "es" ? "Ver la señal"
                   : "View signal";

  const disclaimer = l === "fr"
    ? "Cet email a été envoyé car vous avez activé les alertes email pour ce signal dans MTC. À titre informatif uniquement — pas de conseil financier."
    : l === "es"
    ? "Este correo fue enviado porque activaste las alertas de email para esta señal en MTC. Solo con fines informativos — no es asesoramiento financiero."
    : "This email was sent because you enabled email alerts for this signal in MTC. For informational purposes only — not financial advice.";

  const unsubLabel = l === "fr" ? "Gérer mes alertes"
                   : l === "es" ? "Gestionar mis alertas"
                   : "Manage my alerts";

  return `<!DOCTYPE html>
<html lang="${l}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-flex;align-items:center;gap:8px;">
                <span style="background:${accent};border-radius:10px;width:32px;height:32px;display:inline-block;line-height:32px;text-align:center;font-size:16px;">●</span>
                <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-0.5px;">Mamos Trend Color</span>
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#18181b;border:1px solid #27272a;border-radius:20px;overflow:hidden;">

              <!-- Top accent bar -->
              <div style="height:3px;background:linear-gradient(90deg,transparent,${accent},transparent);"></div>

              <table width="100%" cellpadding="0" cellspacing="0">
                <!-- Heading -->
                <tr>
                  <td style="padding:32px 32px 0;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#71717a;">${heading}</p>
                    <p style="margin:0;font-size:22px;font-weight:800;color:#fff;line-height:1.3;">${subheading}</p>
                  </td>
                </tr>

                <!-- Zone change display -->
                <tr>
                  <td style="padding:28px 32px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <!-- From -->
                        <td width="40%" style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:16px;text-align:center;">
                          <p style="margin:0 0 4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#71717a;">${fromLabel}</p>
                          <p style="margin:0;font-size:13px;font-weight:700;color:#a1a1aa;">${prevLabel}</p>
                        </td>
                        <!-- Arrow -->
                        <td width="20%" align="center" style="font-size:20px;color:#52525b;">→</td>
                        <!-- To -->
                        <td width="40%" style="background:${bgZone};border:1px solid ${accent}40;border-radius:12px;padding:16px;text-align:center;">
                          <p style="margin:0 0 4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${accent};">${toLabel}</p>
                          <p style="margin:0;font-size:13px;font-weight:800;color:#fff;">${newLabel}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Suggested action -->
                <tr>
                  <td style="padding:0 32px 28px;">
                    <div style="background:#09090b;border:1px solid #27272a;border-left:3px solid ${accent};border-radius:8px;padding:14px 16px;">
                      <p style="margin:0 0 2px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#71717a;">${actionLabel}</p>
                      <p style="margin:0;font-size:13px;font-weight:700;color:#e4e4e7;">👉 ${action}</p>
                    </div>
                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td style="padding:0 32px 32px;" align="center">
                    <a href="https://mamos-trend-color.vercel.app/?tab=signal"
                       style="display:inline-block;background:${accent};color:#09090b;font-size:13px;font-weight:800;text-decoration:none;padding:14px 32px;border-radius:12px;">
                      ${btnLabel}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;" align="center">
              <p style="margin:0 0 8px;font-size:10px;color:#52525b;line-height:1.6;max-width:400px;text-align:center;">${disclaimer}</p>
              <a href="https://mamos-trend-color.vercel.app/?tab=alerts"
                 style="font-size:10px;color:#71717a;text-decoration:underline;">${unsubLabel}</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Send via Resend ──────────────────────────────────────────────────────────

async function sendEmail(
  to: string,
  symbol: string,
  prevColor: string,
  newColor: string,
  lang: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }

  const l = (lang === "fr" || lang === "es") ? lang : "en";
  const newLabel = ZONE_LABELS[newColor]?.[l] ?? newColor.toUpperCase();

  const subjects: Record<string, string> = {
    en: `${symbol} — Zone changed to ${newLabel}`,
    fr: `${symbol} — Zone changée : ${newLabel}`,
    es: `${symbol} — Zona cambiada: ${newLabel}`,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [to],
      subject: subjects[l] ?? subjects.en,
      html:    buildEmailHtml(symbol, prevColor, newColor, lang),
    }),
  });

  const data = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok) return { ok: false, error: data.message ?? `HTTP ${res.status}` };
  return { ok: true, id: data.id };
}

// ─── Edge Function entry point ────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Find assets where zone changed between last two signal_history rows
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

  const emailResults: unknown[] = [];

  for (const change of changes as { symbol: string; prev_color: string; new_color: string }[]) {
    const { symbol, prev_color, new_color } = change;
    const notifyField = COLOR_TO_NOTIFY_FIELD[new_color];
    if (!notifyField) continue;

    // 2. Find users who want email alerts for this symbol + this zone
    const { data: settings } = await supabase
      .from("alert_settings")
      .select("user_id")
      .eq("symbol", symbol)
      .eq("notify_on_change", true)
      .eq(notifyField, true);

    if (!settings || settings.length === 0) continue;

    const userIds = (settings as { user_id: string }[]).map((s) => s.user_id);

    // 3. Get their emails + locale from auth.users
    //    We also read a user_preferences table for locale if it exists
    const { data: users } = await supabase.auth.admin.listUsers();
    if (!users) continue;

    const relevantUsers = users.users.filter((u) => userIds.includes(u.id));

    // 4. Check email flag in alert_settings (the `email` column)
    //    (alert_settings stores per-asset zone prefs; global email toggle is in
    //     a separate column if we add it, or we rely on the user having enabled
    //     email alerts globally — for now we send to all who have the zone opted-in)
    for (const user of relevantUsers) {
      const email = user.email;
      if (!email) continue;

      // Detect locale from email metadata or default to 'en'
      const lang = (user.user_metadata?.locale as string | undefined) ?? "en";

      const result = await sendEmail(email, symbol, prev_color, new_color, lang);
      emailResults.push({
        symbol,
        to: email.replace(/(.{2}).*(@.*)/, "$1…$2"), // partial mask
        ...result,
      });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      changes,
      emailResults,
      timestamp: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
