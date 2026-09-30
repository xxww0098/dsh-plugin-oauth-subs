/**
 * Devin quota: POST server.codeium.com SeatManagementService/GetUserStatus.
 */
import { DEVIN_TIER_NAMES, pickDevinHumanAccount } from './index.js';
import { devinUserStatus } from './transport.js';
import { outboundFetch } from '../../utils/outbound.js';
import { asNumber, clampPct, QUOTA_TIMEOUT_MS, timeoutSignal } from '../quota-shared.js';
function devinQuotaRow({ key, kind, label, windowMinutes = undefined, remainingPercent, resetAt }) {
    const remaining = clampPct(remainingPercent);
    if (remaining === undefined)
        return undefined;
    return {
        key,
        kind,
        label,
        ...(windowMinutes !== undefined ? { windowMinutes } : {}),
        remainingPercent: remaining,
        usedPercent: Math.max(0, Math.min(100, 100 - remaining)),
        ...(resetAt !== undefined ? { resetAt } : {}),
    };
}
/**
 * Credit buckets from seat_management.proto: the monthly grant lives in
 * planInfo.monthly*Credits, consumption in planStatus.used*Credits, and
 * `available*Credits` is the server-reported *remaining* balance (top-ups
 * make it diverge from limit−used). Max-tier sends available = -1
 * (unlimited) — clamped to 0 so an all-empty bucket simply emits no row.
 */
const DEVIN_CREDIT_BUCKETS = [
    { product: 'prompt', limit: 'monthlyPromptCredits', used: 'usedPromptCredits', available: 'availablePromptCredits' },
    { product: 'flow', limit: 'monthlyFlowCredits', used: 'usedFlowCredits', available: 'availableFlowCredits' },
    { product: 'flex', limit: 'monthlyFlexCreditPurchaseAmount', used: 'usedFlexCredits', available: 'availableFlexCredits' },
];
function devinCreditRow(bucket, plan, status, resetAt) {
    const rawLimit = asNumber(plan[bucket.limit]);
    const rawAvailable = asNumber(status[bucket.available]);
    const reset = resetAt !== undefined ? { resetAt } : {};
    // Pro/Max tiers send -1 for an uncapped bucket — surface 「不限量」 rather
    // than clamping to 0 and dropping the row.
    if (rawLimit === -1 || rawAvailable === -1) {
        return { key: `credits:${bucket.product}`, kind: 'prepaid', product: bucket.product, unlimited: true, ...reset };
    }
    const used = Math.max(0, asNumber(status[bucket.used]) ?? 0);
    const available = Math.max(0, rawAvailable ?? 0);
    const limit = rawLimit;
    const hasLimit = limit !== undefined && limit > 0;
    if (!hasLimit && used === 0 && available === 0)
        return undefined;
    if (!hasLimit) {
        return { key: `credits:${bucket.product}`, kind: 'prepaid', product: bucket.product, remaining: available, ...reset };
    }
    return {
        key: `credits:${bucket.product}`,
        kind: 'cycle',
        product: bucket.product,
        used,
        total: limit,
        remaining: available,
        remainingPercent: clampPct((available / limit) * 100) ?? 0,
        ...reset,
    };
}
/**
 * GetUserStatusResponse → public quota. `plan_status` carries the daily /
 * weekly quota percents (already *remaining*) and unix-second resets; the
 * plan label is `plan_name` or the `teams_tier` enum (16 = Devin Pro).
 * Credit buckets (prompt / flow / flex) and the accrued overage balance
 * (micro-USD) come first; plan_end is the billing-cycle reset.
 */
export function parseDevinUserStatus(payload) {
    const root = payload && typeof payload === 'object' ? payload : {};
    const user = root.userStatus && typeof root.userStatus === 'object' ? root.userStatus : {};
    const status = user.planStatus && typeof user.planStatus === 'object' ? user.planStatus : {};
    const plan = (status.planInfo && typeof status.planInfo === 'object' ? status.planInfo : undefined)
        ?? (root.planInfo && typeof root.planInfo === 'object' ? root.planInfo : undefined)
        ?? {};
    const tier = user.teamsTier ?? plan.teamsTier;
    const planType = (typeof plan.planName === 'string' && plan.planName.trim())
        ? plan.planName.trim()
        : (typeof tier === 'number' ? DEVIN_TIER_NAMES[tier] : undefined);
    const rows = [];
    const planEnd = status.planEnd;
    for (const bucket of DEVIN_CREDIT_BUCKETS) {
        const row = devinCreditRow(bucket, plan, status, planEnd);
        if (row)
            rows.push(row);
    }
    const overageMicros = asNumber(status.overageBalanceMicros);
    if (overageMicros !== undefined && overageMicros !== 0) {
        rows.push({ key: 'credits:overage', kind: 'prepaid', product: 'overage', unit: 'usd', remaining: overageMicros / 1e6 });
    }
    if (plan.hideDailyQuota !== true) {
        const daily = devinQuotaRow({
            key: 'daily',
            kind: 'primary',
            label: 'Daily',
            windowMinutes: 24 * 60,
            remainingPercent: status.dailyQuotaRemainingPercent,
            resetAt: status.dailyQuotaResetAt,
        });
        if (daily)
            rows.push(daily);
    }
    if (plan.hideWeeklyQuota !== true) {
        const weekly = devinQuotaRow({
            key: 'weekly',
            kind: 'weekly',
            label: 'Weekly',
            remainingPercent: status.weeklyQuotaRemainingPercent,
            resetAt: status.weeklyQuotaResetAt,
        });
        if (weekly)
            rows.push(weekly);
    }
    return {
        planType,
        account: pickDevinHumanAccount(user.email, user.name, plan.devinInfo?.accountDisplayName),
        rows,
    };
}
export async function fetchDevinQuota(session, fetchFn = outboundFetch) {
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const parsed = parseDevinUserStatus(await devinUserStatus(session, { fetchFn, signal: wait.signal }));
        return {
            ...parsed,
            account: parsed.account || session.account,
            planType: parsed.planType || session.planType,
        };
    }
    finally {
        wait.cancel();
    }
}
