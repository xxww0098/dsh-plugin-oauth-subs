/**
 * Codex quota: GET chatgpt.com/backend-api/wham/usage (used_percent
 * windows; remaining is 100 − used), the rate-limit reset-credit bank, and
 * POST …/rate-limit-reset-credits/consume.
 */
import { randomUUID } from 'node:crypto';
import { CODEX_RESET_CONSUME_URL, CODEX_RESET_CREDITS_URL, CODEX_USAGE_URL, codexUpstreamHeaders, } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { asNumber, clampPct, isAvailableResetCredit, QUOTA_TIMEOUT_MS, readJson, resetAtOf, stampOf, timeoutSignal, } from '../quota-shared.js';
function parseCodexWindow(window) {
    if (!window || typeof window !== 'object')
        return undefined;
    const usedPercent = clampPct(window.used_percent ?? window.usedPercent ?? 0) ?? 0;
    const seconds = asNumber(window.limit_window_seconds ?? window.limitWindowSeconds);
    // The SSE frame names its window in minutes (`window_minutes`); the usage
    // endpoint in seconds (`limit_window_seconds`). Same window, two spellings.
    const minutes = asNumber(window.window_minutes ?? window.windowMinutes)
        ?? (seconds !== undefined && seconds > 0 ? Math.floor((seconds + 59) / 60) : undefined);
    return {
        usedPercent,
        remainingPercent: 100 - usedPercent,
        windowMinutes: minutes,
        resetAt: resetAtOf(window),
    };
}
/**
 * The purchasable balance ChatGPT's usage page shows as the credits amount:
 * credits: { has_credits, unlimited, balance } where balance is a string
 * number (the codex CLI's Credits struct on RateLimitSnapshot). The usage
 * endpoint nests it under rate_limit; the codex.rate_limits SSE frame carries
 * it under rate_limits — both spellings land here. has_credits: false means
 * the plan has no credit metering, so no row — not zero.
 */
function codexCreditsRow(payload, rate) {
    const credits = rate?.credits ?? payload?.credits;
    if (!credits || typeof credits !== 'object')
        return undefined;
    const hasCredits = credits.has_credits ?? credits.hasCredits;
    if (hasCredits === false)
        return undefined;
    if (credits.unlimited === true) {
        return { key: 'credits', kind: 'prepaid', product: 'credits', unlimited: true };
    }
    const balance = asNumber(credits.balance);
    if (balance === undefined)
        return undefined;
    return { key: 'credits', kind: 'prepaid', product: 'credits', remaining: balance };
}
function codexRows(primary, secondary, credits) {
    const rows = [];
    if (primary) {
        rows.push({
            key: 'primary',
            kind: 'primary',
            usedPercent: primary.usedPercent,
            remainingPercent: primary.remainingPercent,
            windowMinutes: primary.windowMinutes,
            resetAt: primary.resetAt,
        });
    }
    if (secondary) {
        rows.push({
            key: 'weekly',
            kind: 'weekly',
            usedPercent: secondary.usedPercent,
            remainingPercent: secondary.remainingPercent,
            windowMinutes: secondary.windowMinutes,
            resetAt: secondary.resetAt,
        });
    }
    if (credits)
        rows.push(credits);
    return rows;
}
function payloadPlanType(payload) {
    return typeof payload?.plan_type === 'string' && payload.plan_type
        ? payload.plan_type
        : typeof payload?.planType === 'string' ? payload.planType : undefined;
}
export function parseCodexUsage(payload) {
    if (!payload || typeof payload !== 'object')
        return { rows: [] };
    const rate = payload.rate_limit ?? payload.rateLimit;
    const rows = codexRows(parseCodexWindow(rate?.primary_window ?? rate?.primaryWindow), parseCodexWindow(rate?.secondary_window ?? rate?.secondaryWindow), codexCreditsRow(payload, rate));
    return { planType: payloadPlanType(payload), rows };
}
/**
 * The `codex.rate_limits` SSE frame that opens a Codex Responses stream: the
 * account's own windows ahead of the reply, in the same row shape as
 * `parseCodexUsage` so the quota cards cannot tell them apart. Frame shape per
 * the codex CLI's `RateLimitSnapshot` (windows keyed `primary` / `secondary`,
 * `used_percent`, `window_minutes`, `reset_after_seconds`); the endpoint's
 * `*_window` spellings are accepted too.
 */
export const CODEX_RATE_LIMITS_EVENT = 'codex.rate_limits';
export function parseCodexRateLimitsFrame(payload) {
    if (!payload || typeof payload !== 'object')
        return { rows: [] };
    const rate = payload.rate_limits ?? payload.rateLimits;
    const rows = codexRows(parseCodexWindow(rate?.primary ?? rate?.primary_window ?? rate?.primaryWindow), parseCodexWindow(rate?.secondary ?? rate?.secondary_window ?? rate?.secondaryWindow), codexCreditsRow(payload, rate));
    return { planType: payloadPlanType(payload), rows };
}
function parseResetCredit(item) {
    if (!item || typeof item !== 'object')
        return undefined;
    const rawStatus = typeof item.status === 'string'
        ? item.status
        : typeof item.state === 'string' ? item.state : undefined;
    const expiresAt = stampOf(item.expires_at ?? item.expire_at ?? item.expiresAt);
    let status = rawStatus ? rawStatus.trim().toLowerCase() : undefined;
    if (!status && expiresAt !== undefined && expiresAt <= Date.now())
        status = 'expired';
    const id = item.id ?? item.credit_id ?? item.creditId;
    return {
        id: typeof id === 'string' && id.length > 0 ? id : undefined,
        status,
        expiresAt,
    };
}
export function parseResetCredits(payload) {
    if (!payload || typeof payload !== 'object') {
        return { availableCount: 0, credits: [] };
    }
    const nested = payload.data && typeof payload.data === 'object' ? payload.data : undefined;
    const rawCredits = payload.credits ?? nested?.credits;
    const credits = Array.isArray(rawCredits)
        ? rawCredits.map(parseResetCredit).filter(Boolean)
        : [];
    const listed = asNumber(payload.available_count
        ?? payload.availableCount
        ?? nested?.available_count
        ?? nested?.availableCount);
    const availableCount = listed !== undefined
        ? Math.max(0, Math.round(listed))
        : credits.filter(isAvailableResetCredit).length;
    const listedExpiry = stampOf(payload.expires_at
        ?? payload.expire_at
        ?? payload.next_expire_at
        ?? payload.nextExpiresAt
        ?? nested?.expires_at
        ?? nested?.next_expire_at);
    const fromCredits = credits
        .filter(isAvailableResetCredit)
        .map((credit) => credit?.expiresAt)
        .filter((stamp) => typeof stamp === 'number')
        .sort((a, b) => a - b)[0];
    const nextExpiresAt = fromCredits ?? listedExpiry;
    return {
        availableCount,
        credits,
        ...(nextExpiresAt === undefined ? {} : { nextExpiresAt }),
    };
}
export async function fetchCodexQuota(session, fetchFn = outboundFetch) {
    const headers = codexUpstreamHeaders(session);
    const usageWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    const resetWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const [usageResult, resetResult] = await Promise.allSettled([
            fetchFn(CODEX_USAGE_URL, { method: 'GET', headers, signal: usageWait.signal })
                .then((response) => readJson(response, 'codex usage')),
            fetchFn(CODEX_RESET_CREDITS_URL, { method: 'GET', headers, signal: resetWait.signal })
                .then((response) => readJson(response, 'codex reset credits')),
        ]);
        if (usageResult.status === 'rejected')
            throw usageResult.reason;
        const parsed = parseCodexUsage(usageResult.value);
        const embedded = usageResult.value?.rate_limit_reset_credits ?? usageResult.value?.rateLimitResetCredits;
        const resetCredits = resetResult.status === 'fulfilled'
            ? parseResetCredits(resetResult.value)
            : embedded
                ? parseResetCredits(embedded)
                : { availableCount: 0, credits: [] };
        return { ...parsed, resetCredits };
    }
    finally {
        usageWait.cancel();
        resetWait.cancel();
    }
}
export function consumeResetBody(redeemRequestId) {
    return {
        redeem_request_id: redeemRequestId,
        idempotencyKey: redeemRequestId,
    };
}
export async function consumeCodexReset(session, fetchFn = outboundFetch) {
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
    const redeemRequestId = randomUUID();
    try {
        const response = await fetchFn(CODEX_RESET_CONSUME_URL, {
            method: 'POST',
            headers: {
                ...codexUpstreamHeaders(session),
                'content-type': 'application/json',
            },
            body: JSON.stringify(consumeResetBody(redeemRequestId)),
            signal: wait.signal,
        });
        await readJson(response, 'codex reset consume');
        return { ok: true, redeemRequestId };
    }
    finally {
        wait.cancel();
    }
}
