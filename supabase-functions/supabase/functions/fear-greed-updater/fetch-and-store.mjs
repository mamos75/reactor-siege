// fear-greed-updater/fetch-and-store.mjs
// Node 18+ | Runs on VPS via cron every 12h
//
// Required env vars (set in .env or system environment):
//   CMC_API_KEY            — CoinMarketCap Pro API key
//   SUPABASE_URL           — e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for INSERT)
//
// Usage:
//   node fetch-and-store.mjs
//
// Crontab entry (runs at 00:30 and 12:30 every day):
//   30 0,12 * * * /usr/bin/node /opt/chain-reactors/fear-greed-updater/fetch-and-store.mjs >> /var/log/fear-greed.log 2>&1

import "dotenv/config";

const CMC_API_KEY            = process.env.CMC_API_KEY;
const SUPABASE_URL           = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!CMC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ Variables d'environnement manquantes : CMC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const CMC_ENDPOINT = "https://pro-api.coinmarketcap.com/v3/fear-and-greed/historical";
const LIMIT_DAYS   = 200;

// ── Maths helpers ─────────────────────────────────────────────────────────────

function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

function avg(values) {
    if (!values.length) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
}

function round(value, decimals = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return Number(value.toFixed(decimals));
}

function linearRegressionSlope(values) {
    const n = values.length;
    if (n < 2) return 0;
    const meanX = (n - 1) / 2;
    const meanY = avg(values);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        num += (i - meanX) * (values[i] - meanY);
        den += (i - meanX) ** 2;
    }
    return den === 0 ? 0 : num / den;
}

function getValueNDaysAgo(rows, daysAgo) {
    const index = rows.length - 1 - daysAgo;
    return index >= 0 ? rows[index].value : null;
}

function countDaysInZones(rows, lookback, zones) {
    return rows.slice(-lookback).filter(r => zones.includes(r.zone)).length;
}

// ── Zone classification ───────────────────────────────────────────────────────

function classifyValue(value) {
    if (value <= 20) return "Extreme Fear";
    if (value <= 40) return "Fear";
    if (value <= 60) return "Neutral";
    if (value <= 80) return "Greed";
    return "Extreme Greed";
}

function normalizeZone(classification, value) {
    const c = String(classification || "").toLowerCase();
    if (c.includes("extreme") && c.includes("fear")) return "extreme_fear";
    if (c === "fear")                                  return "fear";
    if (c.includes("neutral"))                         return "neutral";
    if (c.includes("extreme") && c.includes("greed")) return "extreme_greed";
    if (c === "greed")                                 return "greed";
    if (value <= 20) return "extreme_fear";
    if (value <= 40) return "fear";
    if (value <= 60) return "neutral";
    if (value <= 80) return "greed";
    return "extreme_greed";
}

// ── Extreme clusters ──────────────────────────────────────────────────────────

function detectExtremeClusters(rows) {
    const clusters = [];
    let current = null;

    rows.forEach((row, index) => {
        const isExtreme = row.zone === "extreme_fear" || row.zone === "extreme_greed";
        if (!isExtreme) {
            if (current) { clusters.push(current); current = null; }
            return;
        }
        if (!current || current.type !== row.zone) {
            if (current) clusters.push(current);
            current = { type: row.zone, start_index: index, end_index: index,
                        start_date: row.date, end_date: row.date, values: [row.value] };
        } else {
            current.end_index = index;
            current.end_date  = row.date;
            current.values.push(row.value);
        }
    });
    if (current) clusters.push(current);

    return clusters.map(c => ({
        ...c,
        duration_days: c.end_index - c.start_index + 1,
        avg_value:     round(avg(c.values), 2),
        min_value:     Math.min(...c.values),
        max_value:     Math.max(...c.values),
    }));
}

// ── Cycle origin ──────────────────────────────────────────────────────────────

function detectCycleOrigin(rows, clusters) {
    const latest = rows.at(-1);
    if (!latest || !clusters.length) return null;

    const currentValue = latest.value;
    const currentIndex = rows.length - 1;

    const eligible = clusters
        .filter(c => c.end_index <= currentIndex - 3)
        .sort((a, b) => b.end_index - a.end_index);

    for (const c of eligible) {
        const dist = currentValue - c.avg_value;
        if (c.type === "extreme_fear"  && dist >= 15) {
            return { origin_type: "extreme_fear",  origin_label: "Cycle parti d'un Extreme Fear",
                     start_date: c.start_date, end_date: c.end_date,
                     duration_days: c.duration_days, avg_value: c.avg_value,
                     distance_from_origin: round(dist, 2) };
        }
        if (c.type === "extreme_greed" && dist <= -15) {
            return { origin_type: "extreme_greed", origin_label: "Cycle parti d'un Extreme Greed",
                     start_date: c.start_date, end_date: c.end_date,
                     duration_days: c.duration_days, avg_value: c.avg_value,
                     distance_from_origin: round(dist, 2) };
        }
    }

    return { origin_type: "unknown",
             origin_label: "Pas d'origine extrême claire sur les 200 derniers jours",
             start_date: null, end_date: null, duration_days: null,
             avg_value: null, distance_from_origin: null };
}

// ── Trend analysis ────────────────────────────────────────────────────────────

function analyzeTrend(rows) {
    const values  = rows.map(r => r.value);
    const current = values.at(-1);

    const slope7d  = values.length >= 8  ? current - getValueNDaysAgo(rows, 7)  : null;
    const slope14d = values.length >= 15 ? current - getValueNDaysAgo(rows, 14) : null;
    const slope30d = values.length >= 31 ? current - getValueNDaysAgo(rows, 30) : null;

    const regressionSlope14d = linearRegressionSlope(values.slice(-14));
    const regressionSlope30d = linearRegressionSlope(values.slice(-30));

    let direction = "neutral";
    if      (slope30d >= 20 && regressionSlope30d >  0.4) direction = "strong_rising_sentiment";
    else if (slope30d >= 10 && regressionSlope30d >  0.2) direction = "rising_sentiment";
    else if (slope30d <= -20 && regressionSlope30d < -0.4) direction = "strong_falling_sentiment";
    else if (slope30d <= -10 && regressionSlope30d < -0.2) direction = "falling_sentiment";
    else if (slope7d  >  8  && current <= 40)              direction = "fear_rebound";
    else if (slope7d  < -8  && current >= 60)              direction = "greed_cooling";

    return {
        avg_7d:               round(avg(values.slice(-7)),  2),
        avg_14d:              round(avg(values.slice(-14)), 2),
        avg_30d:              round(avg(values.slice(-30)), 2),
        slope_7d:             round(slope7d,  2),
        slope_14d:            round(slope14d, 2),
        slope_30d:            round(slope30d, 2),
        regression_slope_14d: round(regressionSlope14d, 3),
        regression_slope_30d: round(regressionSlope30d, 3),
        direction,
    };
}

// ── Top/Bottom risk scoring ───────────────────────────────────────────────────

function scoreTopBottomRisk(rows, trend, origin) {
    const values  = rows.map(r => r.value);
    const current = values.at(-1);
    const max100  = Math.max(...values);
    const min100  = Math.min(...values);

    const daysGreed14        = countDaysInZones(rows, 14, ["greed", "extreme_greed"]);
    const daysExtremeGreed14 = countDaysInZones(rows, 14, ["extreme_greed"]);
    const daysFear14         = countDaysInZones(rows, 14, ["fear", "extreme_fear"]);
    const daysExtremeFear14  = countDaysInZones(rows, 14, ["extreme_fear"]);

    let topRisk = 0, bottomRisk = 0;

    // Top risk
    if      (current >= 80) topRisk += 35;
    else if (current >= 76) topRisk += 30;
    else if (current >= 70) topRisk += 22;
    else if (current >= 60) topRisk += 10;

    if      (current >= max100 - 5)  topRisk += 20;
    else if (current >= max100 - 10) topRisk += 10;

    if      (daysGreed14 >= 10) topRisk += 15;
    else if (daysGreed14 >= 7)  topRisk += 10;
    if      (daysExtremeGreed14 >= 3) topRisk += 15;
    else if (daysExtremeGreed14 >= 1) topRisk += 7;

    if (current >= 70 && trend.slope_7d  < 0) topRisk += 15;
    if (current >= 70 && trend.regression_slope_14d < 0) topRisk += 10;
    if (origin?.origin_type === "extreme_fear" && origin.distance_from_origin >= 45) topRisk += 12;

    // Bottom risk
    if      (current <= 20) bottomRisk += 35;
    else if (current <= 24) bottomRisk += 30;
    else if (current <= 30) bottomRisk += 22;
    else if (current <= 40) bottomRisk += 10;

    if      (current <= min100 + 5)  bottomRisk += 20;
    else if (current <= min100 + 10) bottomRisk += 10;

    if      (daysFear14 >= 10) bottomRisk += 15;
    else if (daysFear14 >= 7)  bottomRisk += 10;
    if      (daysExtremeFear14 >= 3) bottomRisk += 15;
    else if (daysExtremeFear14 >= 1) bottomRisk += 7;

    if (current <= 30 && trend.slope_7d > 0) bottomRisk += 15;
    if (current <= 35 && trend.regression_slope_14d > 0) bottomRisk += 10;
    if (origin?.origin_type === "extreme_greed" && origin.distance_from_origin <= -45) bottomRisk += 12;

    topRisk    = clamp(topRisk);
    bottomRisk = clamp(bottomRisk);

    let bias, market_phase;
    if      (topRisk >= 70 && topRisk > bottomRisk + 20) {
        bias = "near_top_risk";
        market_phase = "Risque élevé de top local ou de marché émotionnellement avancé";
    } else if (bottomRisk >= 70 && bottomRisk > topRisk + 20) {
        bias = "near_bottom_risk";
        market_phase = "Probabilité élevée de bottom local ou de capitulation avancée";
    } else if (topRisk > bottomRisk + 15) {
        bias = "top_risk_building";
        market_phase = "Risque de top en construction";
    } else if (bottomRisk > topRisk + 15) {
        bias = "bottom_risk_building";
        market_phase = "Bottom potentiel en construction";
    } else {
        bias = "transition_or_neutral";
        market_phase = "Zone de transition, pas d'excès clair";
    }

    return { top_risk_score: round(topRisk, 1), bottom_risk_score: round(bottomRisk, 1), bias, market_phase };
}

// ── Interpretation ────────────────────────────────────────────────────────────

function buildInterpretation(current, direction, origin, bias) {
    if (bias === "near_top_risk") {
        return `Le sentiment est très élevé (${current}) avec un risque de top local élevé. Ce n'est pas un signal short automatique, mais le marché est émotionnellement avancé. Si le prix BTC arrive en résistance ou si le momentum ralentit, le risque de piège FOMO augmente fortement.`;
    }
    if (bias === "near_bottom_risk") {
        return `Le sentiment est très bas (${current}) avec un risque de bottom local élevé. Ce n'est pas un signal long automatique, mais le marché est probablement proche d'une zone de capitulation émotionnelle. Il faut chercher confirmation par prix, liquidations, funding et structure.`;
    }
    if (origin?.origin_type === "extreme_fear" && current >= 65) {
        return `Le cycle émotionnel semble être parti d'un Extreme Fear et le marché est maintenant en Greed. Cela suggère que le rebond est déjà mature. Plus le prix approche d'une résistance avec un Fear & Greed élevé, plus le risque de top local augmente.`;
    }
    if (origin?.origin_type === "extreme_greed" && current <= 35) {
        return `Le cycle émotionnel semble être parti d'un Extreme Greed et le marché est maintenant revenu en Fear. Cela suggère que la purge émotionnelle est déjà avancée. Si la pente commence à remonter, le scénario bottom devient plus crédible.`;
    }
    if (direction === "fear_rebound") {
        return `Le sentiment sort d'une zone de peur avec une pente court terme positive. C'est souvent plus intéressant pour chercher un bottom que pour chase un pump. Confirmation nécessaire par structure de prix.`;
    }
    if (direction === "greed_cooling") {
        return `Le sentiment reste élevé mais commence à refroidir. C'est typiquement une zone où les longs tardifs deviennent fragiles, surtout si BTC bloque sous résistance.`;
    }
    return `Le signal émotionnel est en transition. Il n'y a pas assez d'excès clair pour conclure top ou bottom uniquement avec le Fear & Greed.`;
}

// ── CMC fetch ─────────────────────────────────────────────────────────────────

async function fetchFearGreedHistory() {
    const url = new URL(CMC_ENDPOINT);
    url.searchParams.set("start", "1");
    url.searchParams.set("limit", String(LIMIT_DAYS));

    const res  = await fetch(url, {
        method: "GET",
        headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY, Accept: "application/json" },
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`Réponse CMC invalide : ${text}`); }
    if (!res.ok) throw new Error(`Erreur CMC ${res.status} : ${JSON.stringify(json)}`);
    if (!Array.isArray(json.data)) throw new Error(`Format CMC inattendu : ${JSON.stringify(json)}`);
    return json.data;
}

function normalizeRows(cmcRows) {
    return cmcRows
        .map(row => {
            const value   = Number(row.value);
            const ts      = Number(row.timestamp);
            const dateObj = Number.isFinite(ts) ? new Date(ts * 1000) : new Date(row.timestamp);
            const classification = row.value_classification || classifyValue(value);
            return { date: dateObj.toISOString().slice(0, 10), value, classification,
                     zone: normalizeZone(classification, value) };
        })
        .filter(r => Number.isFinite(r.value))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Supabase upsert ───────────────────────────────────────────────────────────

async function upsertRow(row) {
    // ?on_conflict=date forces Supabase REST to do an actual UPSERT (UPDATE on conflict)
    const url = `${SUPABASE_URL}/rest/v1/crypto_fear_greed_history?on_conflict=date`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "apikey":        SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type":  "application/json",
            "Prefer":        "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(row),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase upsert failed [${res.status}]: ${err}`);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`[${new Date().toISOString()}] 📡 Fetching CMC Fear & Greed ${LIMIT_DAYS}d history...`);

    const cmcRows = await fetchFearGreedHistory();
    const rows    = normalizeRows(cmcRows);

    if (rows.length < 30) throw new Error(`Historique insuffisant: ${rows.length} jours reçus.`);

    console.log(`✅ ${rows.length} jours reçus. Calcul du Sentiment Cycle Engine...`);

    // Compute analysis on full history
    const clusters    = detectExtremeClusters(rows);
    const origin      = detectCycleOrigin(rows, clusters);
    const trend       = analyzeTrend(rows);
    const risk        = scoreTopBottomRisk(rows, trend, origin);
    const latest      = rows.at(-1);
    const interpretation = buildInterpretation(latest.value, trend.direction, origin, risk.bias);

    const record = {
        date:                     latest.date,
        value:                    latest.value,
        classification:           latest.classification,
        zone:                     latest.zone,

        avg_7d:                   trend.avg_7d,
        avg_14d:                  trend.avg_14d,
        avg_30d:                  trend.avg_30d,
        slope_7d:                 trend.slope_7d,
        slope_14d:                trend.slope_14d,
        slope_30d:                trend.slope_30d,
        regression_slope_14d:     trend.regression_slope_14d,
        regression_slope_30d:     trend.regression_slope_30d,
        direction:                trend.direction,

        cycle_origin_type:        origin?.origin_type        ?? null,
        cycle_origin_label:       origin?.origin_label       ?? null,
        cycle_origin_start_date:  origin?.start_date         ?? null,
        cycle_origin_end_date:    origin?.end_date           ?? null,
        cycle_origin_duration_days: origin?.duration_days    ?? null,
        cycle_origin_avg_value:   origin?.avg_value          ?? null,
        cycle_origin_distance:    origin?.distance_from_origin ?? null,

        top_risk_score:           risk.top_risk_score,
        bottom_risk_score:        risk.bottom_risk_score,
        bias:                     risk.bias,
        market_phase:             risk.market_phase,

        interpretation,
        lookback_days_used:       rows.length,
        computed_at:              new Date().toISOString(),
    };

    console.log("📤 Upsert vers Supabase...", {
        date: record.date, value: record.value, bias: record.bias,
        top_risk: record.top_risk_score, bottom_risk: record.bottom_risk_score,
        direction: record.direction,
    });

    await upsertRow(record);

    console.log(`✅ Supabase upsert OK — ${record.date} | bias: ${record.bias} | top: ${record.top_risk_score} | bottom: ${record.bottom_risk_score}`);
}

main().catch(err => {
    console.error(`❌ [${new Date().toISOString()}] Erreur Sentiment Cycle Engine:`);
    console.error(err.message);
    process.exit(1);
});
