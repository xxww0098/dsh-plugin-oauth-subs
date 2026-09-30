/**
 * Copilot quota: GET api.github.com/copilot_internal/user
 * (premium_interactions remaining %), authorized with the GitHub token.
 */
import { COPILOT_QUOTA_URL, copilotIdentityHeaders, isGithubUserToken, parseCopilotUser } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { QUOTA_TIMEOUT_MS, readJson, timeoutSignal } from '../quota-shared.js';
function copilotResetAt(value) {
    if (typeof value !== 'string' || !value.trim())
        return undefined;
    const stamp = Date.parse(value.trim());
    if (!Number.isFinite(stamp))
        return undefined;
    return stamp;
}
function parseCopilotQuotaSnapshot(snap, kind, label, resetAt) {
    if (!snap || typeof snap !== 'object')
        return undefined;
    if (snap.unlimited === true) {
        return {
            key: kind,
            kind,
            label,
            unlimited: true,
            remainingPercent: 100,
            usedPercent: 0,
            ...(resetAt !== undefined ? { resetAt } : {}),
        };
    }
    const remaining = typeof snap.percent_remaining === 'number' && Number.isFinite(snap.percent_remaining)
        ? snap.percent_remaining
        : undefined;
    if (remaining === undefined)
        return undefined;
    const remainingPercent = Math.max(0, Math.min(100, Math.round(remaining * 10) / 10));
    return {
        key: kind,
        kind,
        label,
        remainingPercent,
        usedPercent: Math.max(0, Math.min(100, 100 - remainingPercent)),
        ...(resetAt !== undefined ? { resetAt } : {}),
    };
}
export function parseCopilotUsage(payload, user) {
    const root = payload && typeof payload === 'object' ? payload : {};
    const snapshots = root.quota_snapshots && typeof root.quota_snapshots === 'object' ? root.quota_snapshots : {};
    const resetAt = copilotResetAt(root.quota_reset_date);
    const identity = parseCopilotUser(user) ?? parseCopilotUser(root) ?? {};
    const planType = typeof root.copilot_plan === 'string' && root.copilot_plan.trim()
        ? root.copilot_plan.trim()
        : undefined;
    const rows = [];
    const premium = parseCopilotQuotaSnapshot(snapshots.premium_interactions, 'primary', 'Premium', resetAt);
    if (premium)
        rows.push(premium);
    const chat = parseCopilotQuotaSnapshot(snapshots.chat, 'chat', 'Chat', resetAt);
    if (chat)
        rows.push(chat);
    const completions = parseCopilotQuotaSnapshot(snapshots.completions, 'completions', 'Completions', resetAt);
    if (completions)
        rows.push(completions);
    return {
        planType,
        account: identity.account,
        rows,
    };
}
function copilotQuotaToken(session) {
    const github = typeof session?.githubToken === 'string' && session.githubToken.trim()
        ? session.githubToken.trim()
        : undefined;
    if (github)
        return { authorization: `token ${github}` };
    if (isGithubUserToken(session?.refreshToken))
        return { authorization: `token ${session.refreshToken.trim()}` };
    if (isGithubUserToken(session?.accessToken))
        return { authorization: `token ${session.accessToken.trim()}` };
    const access = typeof session?.accessToken === 'string' && session.accessToken.trim()
        ? session.accessToken.trim()
        : undefined;
    if (access)
        return { authorization: `Bearer ${access}` };
    throw new Error('copilot session needs a GitHub token');
}
export async function fetchCopilotQuota(session, fetchFn = outboundFetch) {
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const response = await fetchFn(COPILOT_QUOTA_URL, {
            method: 'GET',
            headers: {
                accept: 'application/json',
                ...copilotQuotaToken(session),
                ...copilotIdentityHeaders(),
            },
            signal: wait.signal,
        });
        const parsed = parseCopilotUsage(await readJson(response, 'copilot quota'));
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
