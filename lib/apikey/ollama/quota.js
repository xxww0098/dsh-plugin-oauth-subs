/**
 * Ollama Cloud quota: GET ollama.com/api/balance (official since
 * ollama/ollama#18829, 2026-10-07). `included` is oneOf — legacy plans carry
 * session/weekly `remaining_percent` (0..100 REMAINING) + `resets_at`; credit
 * plans carry `balance_usd` / `allowance_usd` / `period{from,until}`.
 * `purchased.balance_usd` rides alongside both. POST /api/me (GET is 405)
 * still gives identity. The old GET /api/usage `limits.*.usage` fractions are
 * gone — that endpoint is now a request-count history (?range=24h|7d|30d)
 * with no quota semantics, so it is not called. Balance allows 10 req/min
 * per user across all keys: no polling, two calls per refresh.
 */
import { OLLAMA_BALANCE_URL, OLLAMA_ME_URL, ollamaUpstreamHeaders, parseOllamaMe } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { asNumber, quotaReads, resetAtOf, stampOf, } from '../../oauth/quota-shared.js';
/** Global 5h unix buckets, only when a balance row ships no reset stamp. ollama/ollama#12532. */
export const OLLAMA_SESSION_WINDOW_S = 18_000;
/** Global 7d unix buckets shifted −4d from epoch (Mon 00:00 UTC). ollama/ollama#12532. */
export const OLLAMA_WEEKLY_WINDOW_S = 604_800;
const OLLAMA_WEEKLY_SHIFT_S = 4 * 86_400;
export function ollamaSessionResetAt(now = Date.now()) {
    const epoch = Math.floor(now / 1000);
    return (Math.floor(epoch / OLLAMA_SESSION_WINDOW_S) + 1) * OLLAMA_SESSION_WINDOW_S * 1000;
}
export function ollamaWeeklyResetAt(now = Date.now()) {
    const epoch = Math.floor(now / 1000);
    const shifted = epoch - OLLAMA_WEEKLY_SHIFT_S;
    return ((Math.floor(shifted / OLLAMA_WEEKLY_WINDOW_S) + 1) * OLLAMA_WEEKLY_WINDOW_S + OLLAMA_WEEKLY_SHIFT_S) * 1000;
}
function ollamaWindowResetAt(window, kind, now = Date.now()) {
    const stamp = resetAtOf(window) ?? stampOf(window?.next_reset ?? window?.nextReset);
    if (stamp !== undefined)
        return stamp;
    if (kind === 'primary')
        return ollamaSessionResetAt(now);
    if (kind === 'weekly')
        return ollamaWeeklyResetAt(now);
    return undefined;
}
/** Legacy `remaining_percent` is 0..100 remaining; rows carry both spellings. */
function ollamaLimitRow(window, kind, now = Date.now()) {
    if (!window || typeof window !== 'object')
        return undefined;
    const remaining = asNumber(window.remaining_percent ?? window.remainingPercent);
    if (remaining === undefined)
        return undefined;
    const remainingPercent = Math.max(0, Math.min(100, Math.round(remaining * 10) / 10));
    const usedPercent = Math.round((100 - remainingPercent) * 10) / 10;
    const resetAt = ollamaWindowResetAt(window, kind, now);
    return {
        key: kind,
        kind,
        usedPercent,
        remainingPercent,
        ...(kind === 'primary' ? { windowMinutes: 300 } : {}),
        ...(resetAt !== undefined ? { resetAt } : {}),
    };
}
/**
 * Credit plan: one USD meter over the plan period. `used` / `total` with
 * `unit: 'usd'` render as `formatUsd` amounts next to the percent bar; the
 * percent is computed from the balance bag, never assumed to be 100 − usage.
 */
function ollamaCreditsRow(included) {
    if (!included || typeof included !== 'object')
        return undefined;
    const balance = asNumber(included.balance_usd ?? included.balanceUsd);
    const allowance = asNumber(included.allowance_usd ?? included.allowanceUsd);
    if (balance === undefined || allowance === undefined || allowance <= 0)
        return undefined;
    const remainingPercent = Math.max(0, Math.min(100, Math.round((balance / allowance) * 1000) / 10));
    const period = included.period && typeof included.period === 'object' ? included.period : undefined;
    const resetAt = period ? stampOf(period.until) : undefined;
    return {
        key: 'primary',
        kind: 'primary',
        usedPercent: Math.round((100 - remainingPercent) * 10) / 10,
        remainingPercent,
        used: Math.max(0, Math.round((allowance - balance) * 100) / 100),
        total: allowance,
        unit: 'usd',
        ...(resetAt !== undefined ? { resetAt } : {}),
    };
}
/** Purchased credits sit outside the included allowance — a separate prepaid row. */
function ollamaPurchasedRow(purchased) {
    const balance = asNumber(purchased && typeof purchased === 'object'
        ? purchased.balance_usd ?? purchased.balanceUsd
        : undefined);
    if (balance === undefined || balance <= 0)
        return undefined;
    return {
        key: 'purchased',
        kind: 'prepaid',
        unit: 'usd',
        remaining: balance,
    };
}
export function parseOllamaBalance(balance, me, now = Date.now()) {
    const root = balance && typeof balance === 'object' ? balance : {};
    const included = root.included && typeof root.included === 'object' ? root.included : root;
    const identity = parseOllamaMe(me);
    const rows = [];
    const session = ollamaLimitRow(included.session, 'primary', now);
    const weekly = ollamaLimitRow(included.weekly, 'weekly', now);
    if (session)
        rows.push(session);
    if (weekly)
        rows.push(weekly);
    // `included` is oneOf: credit plans only when no legacy windows came back.
    if (rows.length === 0) {
        const credits = ollamaCreditsRow(included);
        if (credits)
            rows.push(credits);
    }
    const purchased = ollamaPurchasedRow(root.purchased);
    if (purchased)
        rows.push(purchased);
    return {
        planType: identity.planType,
        account: identity.account,
        rows,
    };
}
export async function fetchOllamaQuota(session, fetchFn = outboundFetch) {
    const headers = ollamaUpstreamHeaders(session);
    const [balance, me] = await quotaReads(fetchFn, [
        { url: OLLAMA_BALANCE_URL, label: 'ollama balance', init: { headers } },
        { url: OLLAMA_ME_URL, label: 'ollama me', init: { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' } },
    ]);
    // Either answer tells part of the card — the balance of one, the identity of
    // the other — so only losing both is a failed read.
    if (!balance.ok && !me.ok)
        throw balance.error;
    return parseOllamaBalance(balance.ok ? balance.raw : undefined, me.ok ? me.raw : undefined);
}
