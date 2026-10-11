/**
 * Cline quota. Two authenticated reads plus one optional plan read:
 *   GET /api/v1/users/me                → identity (email, usr-… id)
 *   GET /api/v1/users/{id}/balance      → credit balance, micro-USD
 *   GET /api/v1/users/me/plan           → subscription plan (404 = none)
 *
 * `ClineAccountService` in the pinned CLI reads exactly these; the balance is
 * divided by 1e6 (`normalizeCreditBalance` in `apps/cli/src/utils/output.ts`)
 * before it is shown as USD. Cline ships no percent-based window endpoint —
 * ClinePass limits surface only as a 429/402 body — so the card carries the
 * credit balance (`prepaid` row) and the plan name.
 */
import { CLINE_CAP_FIELDS, CLINE_COST_SCALE, CLINE_CREDIT_SCALE, CLINE_ME_URL, CLINE_PLAN_LIMITS_URL, CLINE_PLAN_URL, CLINE_QUOTA_WINDOWS, CLINE_USAGE_BILLING, clineBalanceUrl, clineBearer, clineIdentityHeaders, parseClineUserInfo, } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { asNumber, quotaReads } from '../quota-shared.js';
function envelope(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return undefined;
    // `{success, data}` on success; `{success:false, error}` carries no data.
    if (payload.success === false)
        return undefined;
    return payload.data && typeof payload.data === 'object' ? payload.data : payload;
}
/** `normalizeCreditBalance` — micro-USD → USD. */
export function clineCreditUsd(value) {
    const micro = asNumber(value);
    if (micro === undefined)
        return undefined;
    return Math.round((micro / CLINE_CREDIT_SCALE) * 100) / 100;
}
export function parseClineBalance(payload) {
    const data = envelope(payload);
    const usd = clineCreditUsd(data?.balance);
    if (usd === undefined)
        return undefined;
    return {
        usd,
        ...(typeof data?.userId === 'string' && data.userId.trim() ? { userId: data.userId.trim() } : {}),
    };
}
/** Entitlement caps share the 1e-8 USD unit of `/usages.costUsd`. */
export function clineCapUsd(value) {
    const raw = asNumber(value);
    if (raw === undefined || raw <= 0)
        return undefined;
    return Math.round((raw / CLINE_COST_SCALE) * 100) / 100;
}
/**
 * `/api/v1/users/me/plan` — `UserCurrentPlan`; 404 when the user has none.
 * ClinePass caps ride `data.plan.entitlements.cline_pass
 * .inferenceCapThreshold`; a credit account carries none, so a bar is only
 * ever drawn from a cap the server actually sent.
 */
export function parseClinePlan(payload) {
    const data = envelope(payload);
    if (!data || typeof data !== 'object')
        return undefined;
    const plan = data.plan && typeof data.plan === 'object' ? data.plan : undefined;
    const planType = typeof plan?.displayName === 'string' && plan.displayName.trim()
        ? plan.displayName.trim()
        : typeof plan?.name === 'string' && plan.name.trim()
            ? plan.name.trim()
            : typeof plan?.id === 'string' && plan.id.trim() ? plan.id.trim() : undefined;
    const periodEnd = typeof data.currentPeriodEnd === 'string' && data.currentPeriodEnd.trim()
        ? Date.parse(data.currentPeriodEnd.trim())
        : undefined;
    const entitlements = plan?.entitlements && typeof plan.entitlements === 'object' ? plan.entitlements : undefined;
    const clinePass = entitlements?.cline_pass && typeof entitlements.cline_pass === 'object' ? entitlements.cline_pass : undefined;
    const threshold = clinePass?.inferenceCapThreshold && typeof clinePass.inferenceCapThreshold === 'object'
        ? clinePass.inferenceCapThreshold
        : undefined;
    const caps = {};
    if (threshold) {
        for (const [type, field] of Object.entries(CLINE_CAP_FIELDS)) {
            const usd = clineCapUsd(threshold[field]);
            if (usd !== undefined)
                caps[type] = usd;
        }
    }
    if (!planType && !Number.isFinite(periodEnd) && Object.keys(caps).length === 0)
        return undefined;
    return {
        ...(planType ? { planType } : {}),
        ...(Number.isFinite(periodEnd) ? { periodEnd } : {}),
        ...(Object.keys(caps).length > 0 ? { caps } : {}),
    };
}
/**
 * `GET /api/v1/users/me/plan/usage-limits` — server-truth rolling windows:
 * `{success, data:{limits:[{type, percentUsed, resetsAt}]}}` with
 * `type ∈ five_hour | weekly | monthly`. A credit account answers the same
 * plan-level 404 as `/users/me/plan` (`no plan history found for user`) —
 * live-probed 2026-09-19, which is what separates it from a missing route
 * (`{"error":"Not Found"}`).
 */
export function parseClinePlanLimits(payload) {
    const data = envelope(payload);
    const list = Array.isArray(data?.limits) ? data.limits : [];
    const limits = [];
    for (const item of list) {
        if (!item || typeof item !== 'object')
            continue;
        const type = typeof item.type === 'string' ? item.type.trim() : '';
        if (!CLINE_QUOTA_WINDOWS[type])
            continue;
        const raw = asNumber(item.percentUsed);
        if (raw === undefined)
            continue;
        const usedPercent = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
        const resetAt = typeof item.resetsAt === 'string' && item.resetsAt.trim()
            ? Date.parse(item.resetsAt.trim())
            : undefined;
        limits.push({
            type,
            usedPercent,
            ...(Number.isFinite(resetAt) ? { resetAt } : {}),
        });
    }
    return limits;
}
export function parseClineUsage(user, balance, plan, limits = []) {
    const identity = parseClineUserInfo(user) ?? {};
    const rows = [];
    for (const limit of limits) {
        const window = CLINE_QUOTA_WINDOWS[limit.type];
        if (!window)
            continue;
        const capUsd = plan?.caps?.[limit.type];
        const usedUsd = capUsd === undefined
            ? undefined
            : Math.round(((capUsd * limit.usedPercent) / 100) * 100) / 100;
        rows.push({
            key: limit.type,
            kind: window.kind,
            ...(window.windowMinutes === undefined ? {} : { windowMinutes: window.windowMinutes }),
            usedPercent: limit.usedPercent,
            remainingPercent: Math.round((100 - limit.usedPercent) * 10) / 10,
            ...(limit.resetAt === undefined ? {} : { resetAt: limit.resetAt }),
            // Amounts only when the plan published a cap — never an invented total.
            ...(usedUsd === undefined ? {} : { used: usedUsd, total: capUsd, unit: 'usd' }),
        });
    }
    if (balance && typeof balance.usd === 'number' && balance.usd > 0) {
        rows.push({
            key: 'credits',
            kind: 'prepaid',
            remaining: balance.usd,
            unit: 'usd',
        });
    }
    return {
        account: identity.account,
        userId: identity.userId ?? balance?.userId,
        planType: plan?.planType ?? identity.planType ?? CLINE_USAGE_BILLING,
        rows,
    };
}
export async function fetchClineQuota(session, fetchFn = outboundFetch) {
    const authorization = `Bearer ${clineBearer(session)}`;
    const headers = { ...clineIdentityHeaders(), authorization };
    const [me] = await quotaReads(fetchFn, [
        { url: CLINE_ME_URL, label: 'cline me', init: { headers }, parse: envelope },
    ]);
    if (!me.ok)
        throw me.error;
    const userId = typeof me.value?.id === 'string' && me.value.id.trim()
        ? me.value.id.trim()
        : typeof session?.userId === 'string' && session.userId.trim() ? session.userId.trim() : undefined;
    if (!userId)
        throw new Error('cline account id is unavailable');
    // The balance is what the card is; both plan reads 404 for a credit account,
    // so they stay best-effort and the balance row survives a missing plan. Each
    // follow-up is armed with its own full budget: a slow `me` read cannot eat
    // theirs, and an unread body is drained by the read itself.
    const [balance, plan, limits] = await quotaReads(fetchFn, [
        { url: clineBalanceUrl(userId), label: 'cline balance', init: { headers }, parse: parseClineBalance },
        { url: CLINE_PLAN_URL, label: 'cline plan', init: { headers }, parse: parseClinePlan },
        { url: CLINE_PLAN_LIMITS_URL, label: 'cline plan limits', init: { headers }, parse: parseClinePlanLimits },
    ]);
    if (!balance.ok)
        throw balance.error;
    return parseClineUsage(me.value, balance.value, plan.ok ? plan.value : undefined, limits.ok ? limits.value : []);
}
