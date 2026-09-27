/**
 * Anthropic subscription quota.
 *
 * There is no usage endpoint behind the Claude OAuth token — senpi/pi-ai and
 * Claude Code itself read consumption reactively. What the subscription lane
 * does expose is the unified rate-limit telemetry on every Messages response
 * (200 and 429 alike):
 *
 *   anthropic-ratelimit-unified-5h-utilization   0..1 of the 5-hour window
 *   anthropic-ratelimit-unified-5h-reset         window reset timestamp
 *   anthropic-ratelimit-unified-7d-utilization   0..1 of the weekly window
 *   anthropic-ratelimit-unified-7d-reset         weekly reset timestamp
 *
 * (community-pinned from Claude Code usage trackers: pi-usage-limit-tracker,
 * @mtrojnar/pi-usage, oc-anthropic-multi-account). The fetcher therefore sends
 * a 1-token probe (`max_tokens: 1`, haiku) and reads the headers — the same
 * tiny-throttled-request practice those trackers use. A 429 is not an error:
 * an exhausted window still reports its utilization.
 */
import { ANTHROPIC_MESSAGES_URL, ANTHROPIC_PROBE_MODEL, anthropicUpstreamHeaders } from './index.js';
function parseFraction(value) {
    if (typeof value !== 'string' && typeof value !== 'number')
        return undefined;
    const raw = typeof value === 'string' ? value.trim() : value;
    const fraction = Number(raw);
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
        return undefined;
    return fraction;
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
function windowRow(kind, label, headers, suffix) {
    const used = parseFraction(headers.get(`anthropic-ratelimit-unified-${suffix}-utilization`));
    if (used === undefined)
        return undefined;
    const resetAt = parseReset(headers.get(`anthropic-ratelimit-unified-${suffix}-reset`));
    const usedPercent = Math.max(0, Math.min(100, Math.round(used * 1000) / 10));
    return {
        key: `anthropic-${suffix}`,
        kind,
        label,
        usedPercent,
        remainingPercent: Math.max(0, Math.min(100, Math.round((100 - usedPercent) * 10) / 10)),
        ...(resetAt !== undefined ? { resetAt } : {}),
    };
}
export function parseAnthropicRateLimitHeaders(headers) {
    const get = headers?.get?.bind(headers);
    if (typeof get !== 'function')
        return { rows: [] };
    const rows = [
        windowRow('primary', '5 小时 · 5-hour', headers, '5h'),
        windowRow('weekly', '每周 · Weekly', headers, '7d'),
    ].filter(Boolean);
    return { rows };
}
export async function fetchAnthropicQuota(session, fetchFn = fetch) {
    const wait = AbortSignal.timeout(10_000);
    const response = await fetchFn(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: { ...anthropicUpstreamHeaders(session), 'content-type': 'application/json' },
        body: JSON.stringify({
            model: ANTHROPIC_PROBE_MODEL,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: wait,
    });
    const parsed = parseAnthropicRateLimitHeaders(response.headers);
    if (parsed.rows.length === 0) {
        let body = '';
        try {
            body = await response.text();
        }
        catch {
            body = '';
        }
        throw new Error(`anthropic quota: no unified rate-limit headers (HTTP ${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    return {
        planType: session.planType,
        account: session.account,
        subscriptionStatus: response.status === 429 ? 'rate_limited' : 'active',
        ...parsed,
    };
}
