/**
 * Kiro quota: getUsageLimits across the account's usage regions.
 */
import { pickPlanRaw } from '../plan.js';
import { kiroProfileArn, kiroUsageHeaders, kiroUsageRegions, kiroUsageUrl } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { asNumber, clampPct, QUOTA_TIMEOUT_MS, readJson, stampOf, timeoutSignal } from '../quota-shared.js';
export function parseKiroUsage(payload) {
    if (!payload || typeof payload !== 'object')
        return { rows: [] };
    const info = payload.subscriptionInfo ?? payload.subscription_info ?? {};
    const user = payload.userInfo ?? payload.user_info ?? {};
    const list = payload.usageBreakdownList ?? payload.usage_breakdown_list ?? [];
    const planType = pickPlanRaw(info.subscriptionTitle, info.subscription_title, payload.planType);
    const email = typeof user.email === 'string' && user.email.trim() ? user.email.trim() : undefined;
    const breakdown = Array.isArray(list) ? list[0] : undefined;
    if (!breakdown || typeof breakdown !== 'object') {
        return { planType, account: email, rows: [] };
    }
    let used = asNumber(breakdown.currentUsageWithPrecision
        ?? breakdown.current_usage_with_precision
        ?? breakdown.currentUsage
        ?? breakdown.current_usage) ?? 0;
    let total = asNumber(breakdown.usageLimitWithPrecision
        ?? breakdown.usage_limit_with_precision
        ?? breakdown.usageLimit
        ?? breakdown.usage_limit) ?? 0;
    const trial = breakdown.freeTrialInfo ?? breakdown.free_trial_info;
    const trialStatus = String(trial?.freeTrialStatus ?? trial?.free_trial_status ?? '').toUpperCase();
    if (trial && trialStatus === 'ACTIVE') {
        used += asNumber(trial.currentUsageWithPrecision ?? trial.current_usage_with_precision ?? trial.currentUsage) ?? 0;
        total += asNumber(trial.usageLimitWithPrecision ?? trial.usage_limit_with_precision ?? trial.usageLimit) ?? 0;
    }
    for (const bonus of Array.isArray(breakdown.bonuses) ? breakdown.bonuses : []) {
        if (String(bonus?.status ?? '').toUpperCase() !== 'ACTIVE')
            continue;
        used += asNumber(bonus.currentUsage ?? bonus.current_usage) ?? 0;
        total += asNumber(bonus.usageLimit ?? bonus.usage_limit) ?? 0;
    }
    const usedPercent = total > 0 ? clampPct((used / total) * 100) : undefined;
    const resetAt = stampOf(breakdown.nextDateReset
        ?? breakdown.next_date_reset
        ?? payload.nextDateReset
        ?? payload.next_date_reset);
    return {
        planType,
        account: email,
        rows: [{
                key: 'cycle',
                kind: 'cycle',
                usedPercent,
                remainingPercent: usedPercent === undefined ? undefined : 100 - usedPercent,
                used,
                total,
                remaining: total > 0 ? Math.max(0, total - used) : undefined,
                resetAt,
            }],
    };
}
// getUsageLimits 400s "Invalid profileArn." without an ARN (Builder ID) —
// send the ARN chat uses; a regional 403 moves on to the next region.
export async function fetchKiroQuota(session, fetchFn = outboundFetch) {
    const profileArn = kiroProfileArn(session);
    let lastError;
    for (const region of kiroUsageRegions(session)) {
        const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
        try {
            const response = await fetchFn(kiroUsageUrl(region, profileArn), {
                method: 'GET',
                headers: kiroUsageHeaders(session),
                signal: wait.signal,
            });
            if (response.ok) {
                return parseKiroUsage(await readJson(response, 'kiro usage'));
            }
            const text = await response.text();
            lastError = new Error(`kiro usage failed (HTTP ${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
            if (response.status !== 403)
                throw lastError;
        }
        finally {
            wait.cancel();
        }
    }
    throw lastError;
}
