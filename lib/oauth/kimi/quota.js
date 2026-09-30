/**
 * Kimi quota: /usages windows plus /me for identity.
 */
import { KIMI_ME_URL, KIMI_USAGE_URL, kimiUpstreamHeaders, parseKimiUserInfo } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { asNumber, clampPct, creditBagAmounts, QUOTA_TIMEOUT_MS, readJson, resetAtOf, timeoutSignal, } from '../quota-shared.js';
function parseKimiUsageRow(value, fallbackKind, fallbackLabel) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const bag = creditBagAmounts(value);
    if (!bag || (bag.total === undefined && bag.used === undefined && bag.remaining === undefined))
        return undefined;
    const total = bag.total;
    const used = bag.used ?? 0;
    const remaining = bag.remaining;
    const remainingPercent = total && total > 0
        ? clampPct(((remaining ?? Math.max(0, total - used)) / total) * 100)
        : undefined;
    const usedPercent = remainingPercent === undefined ? undefined : 100 - remainingPercent;
    const resetAt = resetAtOf(value);
    const label = typeof value.name === 'string' && value.name.trim()
        ? value.name.trim()
        : typeof value.title === 'string' && value.title.trim()
            ? value.title.trim()
            : fallbackLabel;
    return {
        key: fallbackKind,
        kind: fallbackKind,
        product: label,
        usedPercent,
        remainingPercent,
        ...(used !== undefined && total !== undefined ? { used, total } : {}),
        ...(resetAt !== undefined ? { resetAt } : {}),
    };
}
function kimiWindowKind(window, index) {
    if (!window || typeof window !== 'object') {
        return index === 0 ? 'primary' : index === 1 ? 'weekly' : 'product';
    }
    const duration = asNumber(window.duration);
    const unit = String(window.timeUnit ?? window.time_unit ?? '').toUpperCase();
    if (unit.includes('WEEK'))
        return 'weekly';
    if (unit.includes('DAY'))
        return 'cycle';
    if (unit.includes('HOUR') && duration === 5)
        return 'primary';
    if (unit.includes('HOUR') || unit.includes('MINUTE'))
        return 'primary';
    return index === 0 ? 'primary' : 'product';
}
export function parseKimiUsage(payload, me) {
    const root = payload && typeof payload === 'object' ? payload : {};
    const identity = parseKimiUserInfo(me && typeof me === 'object' ? me : root) ?? {};
    const rows = [];
    const summary = parseKimiUsageRow(root.usage, 'cycle', 'Current week');
    if (summary)
        rows.push(summary);
    if (Array.isArray(root.limits)) {
        for (const [index, item] of root.limits.entries()) {
            const record = item && typeof item === 'object' && !Array.isArray(item) ? item : undefined;
            const detail = record ? (record.detail ?? record) : item;
            const kind = kimiWindowKind(record?.window, index);
            const row = parseKimiUsageRow(detail, kind, kind === 'primary' ? '5h' : kind === 'weekly' ? 'week' : `limit ${index + 1}`);
            if (row)
                rows.push(row);
        }
    }
    return {
        planType: identity.planType,
        account: identity.account,
        rows,
    };
}
export async function fetchKimiQuota(session, fetchFn = outboundFetch) {
    const headers = kimiUpstreamHeaders(session);
    const usageWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    const meWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const [usageResult, meResult] = await Promise.allSettled([
            fetchFn(KIMI_USAGE_URL, { method: 'GET', headers, signal: usageWait.signal })
                .then((response) => readJson(response, 'kimi usage')),
            fetchFn(KIMI_ME_URL, { method: 'GET', headers, signal: meWait.signal })
                .then((response) => readJson(response, 'kimi me')),
        ]);
        if (usageResult.status === 'rejected' && meResult.status === 'rejected') {
            throw usageResult.reason;
        }
        const usage = usageResult.status === 'fulfilled' ? usageResult.value : {};
        const me = meResult.status === 'fulfilled' ? meResult.value : undefined;
        return parseKimiUsage(usage, me);
    }
    finally {
        usageWait.cancel();
        meWait.cancel();
    }
}
