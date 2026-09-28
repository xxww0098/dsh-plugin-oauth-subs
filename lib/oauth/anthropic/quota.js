/**
 * Anthropic subscription quota.
 *
 * GET /api/oauth/usage is the only source — one response carries the 5-hour,
 * weekly, and every model-scoped meter (Fable etc.). Same design as
 * stablyai/orca's claude-oauth-usage-request.ts: no billable Messages probe.
 * On failure the caller keeps the previous snapshot, so throwing is enough.
 */
import { ANTHROPIC_USAGE_URL, anthropicUsageHeaders } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
function parsePercent(value) {
    if (typeof value !== 'string' && typeof value !== 'number')
        return undefined;
    const raw = typeof value === 'string' ? value.trim() : value;
    const percent = Number(raw);
    if (!Number.isFinite(percent) || percent < 0)
        return undefined;
    return Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
}
function parseReset(value) {
    if (typeof value !== 'string' && typeof value !== 'number')
        return undefined;
    const raw = typeof value === 'string' ? value.trim() : value;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        // Epoch seconds vs milliseconds: a 17-digit stamp is already ms.
        return raw > 1e14 ? Math.round(raw) : Math.round(raw * 1000);
    }
    if (typeof raw === 'string' && /^\d+$/.test(raw)) {
        const numeric = Number(raw);
        return numeric > 1e14 ? numeric : numeric * 1000;
    }
    if (typeof raw === 'string') {
        const at = Date.parse(raw);
        if (Number.isFinite(at))
            return at;
    }
    return undefined;
}
function percentRow(kind, key, label, used, reset) {
    const usedPercent = parsePercent(used);
    if (usedPercent === undefined)
        return undefined;
    const resetAt = parseReset(reset);
    return {
        key,
        kind,
        label,
        usedPercent,
        remainingPercent: Math.max(0, Math.min(100, Math.round((100 - usedPercent) * 10) / 10)),
        ...(resetAt !== undefined ? { resetAt } : {}),
    };
}
function usageWindowRow(kind, key, label, limit, fallback) {
    const row = percentRow(kind, key, label, limit?.percent ?? limit?.utilization, limit?.resets_at ?? limit?.reset_at ?? limit?.resetAt);
    return row ?? (fallback ? percentRow(kind, key, label, fallback.percent ?? fallback.utilization, fallback.resets_at ?? fallback.reset_at ?? fallback.resetAt) : undefined);
}
function modelKey(value) {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';
}
// Legacy flat windows the usage payload still emits alongside `limits[]`.
// `seven_day_overage_included` is the Fable-scoped weekly meter (`7d_oi` in
// unified headers — Claude Code's label map renders it as "Fable 5 limit").
const LEGACY_SCOPED = [
    ['seven_day_opus', 'Opus'],
    ['seven_day_sonnet', 'Sonnet'],
    ['seven_day_cowork', 'Cowork'],
    ['seven_day_oauth_apps', 'OAuth Apps'],
    // The Fable meter's flat-window spelling has drifted; orca maps
    // fable_weekly / fable_seven_day / seven_day_fable for the same bucket.
    [['seven_day_overage_included', 'fable_weekly', 'fable_seven_day', 'seven_day_fable'], 'Fable'],
];
export function parseAnthropicUsage(payload) {
    if (!payload || typeof payload !== 'object')
        return { rows: [] };
    const limits = Array.isArray(payload.limits) ? payload.limits : [];
    const find = (kind) => limits.find((limit) => limit?.kind === kind);
    const rows = [
        usageWindowRow('primary', 'anthropic-5h', '5 小时 · 5-hour', find('session'), payload.five_hour),
        usageWindowRow('weekly', 'anthropic-7d', '每周 · Weekly', find('weekly_all'), payload.seven_day),
    ].filter(Boolean);
    const scoped = new Set();
    for (const limit of limits) {
        if (limit?.kind !== 'weekly_scoped')
            continue;
        const model = limit.scope?.model;
        const displayName = typeof model?.display_name === 'string' ? model.display_name.trim() : '';
        if (!displayName)
            continue;
        const row = percentRow('weekly_scoped', 'anthropic-7d-' + modelKey(model.id ?? displayName), displayName, limit.percent ?? limit.utilization, limit.resets_at ?? limit.reset_at ?? limit.resetAt);
        if (row) {
            scoped.add(displayName.toLowerCase());
            rows.push({ ...row, product: displayName });
        }
    }
    for (const [fields, label] of LEGACY_SCOPED) {
        if (scoped.has(label.toLowerCase()))
            continue;
        const names = Array.isArray(fields) ? fields : [fields];
        const window = names.map((name) => payload[name]).find((value) => value && typeof value === 'object');
        const row = percentRow('weekly_scoped', 'anthropic-7d-' + modelKey(label), label, window?.utilization ?? window?.percent, window?.resets_at ?? window?.reset_at ?? window?.resetAt);
        if (row)
            rows.push({ ...row, product: label });
    }
    return { rows };
}
export async function fetchAnthropicQuota(session, fetchFn = outboundFetch) {
    const response = await fetchFn(ANTHROPIC_USAGE_URL, {
        method: 'GET',
        headers: anthropicUsageHeaders(session),
        signal: AbortSignal.timeout(10_000),
    });
    let payload;
    try {
        payload = await response.json();
    }
    catch {
        payload = undefined;
    }
    const rows = parseAnthropicUsage(payload).rows;
    // A non-200 with no readable meters is a failure: throw and let the caller
    // keep the previous snapshot. A 200 without meters means they are gone.
    if (rows.length === 0 && response.status !== 200) {
        const details = typeof payload?.error?.message === 'string' ? ': ' + payload.error.message.slice(0, 200) : '';
        throw new Error(`anthropic quota: OAuth usage limits unavailable (HTTP ${response.status})${details}`);
    }
    return {
        planType: session.planType,
        account: session.account,
        subscriptionStatus: response.status === 429 ? 'rate_limited' : 'active',
        rows,
    };
}
