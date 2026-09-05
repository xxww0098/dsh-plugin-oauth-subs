/**
 * Subscription quota:
 *   Codex  GET chatgpt.com/backend-api/wham/usage
 *          GET chatgpt.com/backend-api/wham/rate-limit-reset-credits
 *          POST …/rate-limit-reset-credits/consume
 *   Grok   GET cli-chat-proxy.grok.com/v1/billing?format=credits
 *          GET cli-chat-proxy.grok.com/v1/user?include=subscription
 *          POST grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
 *   Antigravity  POST daily-cloudcode-pa …/v1internal:loadCodeAssist
 *                POST daily-cloudcode-pa …/v1internal:retrieveUserQuotaSummary
 *                POST daily-cloudcode-pa …/v1internal:fetchAvailableModels (5h fallback)
 *                Official Model Quota UI is two groups × (weekly + 5-hour).
 *   Ollama  GET ollama.com/api/usage  (limits.session/weekly.usage = 0..1)
 *           POST ollama.com/api/me    (Email / Name / Plan; GET is 405)
 *   OpenCode Go Free  no public usage API; card stays idle / empty rows, plan Go Free
 *   Copilot GET api.github.com/copilot_internal/user (premium_interactions remaining %)
 *
 * Codex windows report used_percent; remaining is 100 − used.
 * Grok creditUsagePercent is also used-percent. Display remaining in the UI.
 * Unified-billing SuperGrok / X Premium+ payloads often omit that percent
 * on the CLI JSON; the grok.com gRPC-web path still has the weekly pool.
 */
import { randomUUID } from 'node:crypto';
import { CODEX_USAGE_URL, CODEX_RESET_CREDITS_URL, CODEX_RESET_CONSUME_URL, codexUpstreamHeaders, } from './codex/index.js';
import { GROK_BILLING_URL, GROK_CLI_USER_URL, GROK_CREDITS_URL, GROK_CLIENT_VERSION, grokCreditsHeaders, grokTierFromValue, grokUpstreamHeaders, } from './grok/index.js';
import { GROK_WEB_EMPTY_FRAME, decodeGrokCreditsFrame } from './grok/credits-frame.js';
import { formatPlanLabel, pickPlanRaw } from './plan.js';
import { glmQuotaUrl, glmToolUsageUrl, glmUpstreamHeaders } from './glm/index.js';
import { kiroEffectiveProfileArn, kiroUsageHeaders, kiroUsageRegions, kiroUsageUrl, } from './kiro/index.js';
import { accountIdOf } from './store.js';
import { ANTIGRAVITY_LOAD_CODE_ASSIST_URL, ANTIGRAVITY_MODELS_URL, ANTIGRAVITY_QUOTA_SUMMARY_URL, ANTIGRAVITY_QUOTA_GROUPS, antigravityLoadCodeAssistBody, antigravityLoadCodeAssistHeaders, antigravityPlanType, extractCloudaicompanionProject, fetchAntigravityCloudCode, isCodeAssistOnlyPlan, } from './antigravity/index.js';
import { CURSOR_GET_EMAIL_URL, CURSOR_GET_ME_URL, CURSOR_STRIPE_PROFILE_URL, CURSOR_USAGE_URL, cursorMembershipFromStripe, cursorNameFromProfile, cursorUsageHeaders, pickCursorHumanAccount, } from './cursor/index.js';
import { OLLAMA_ME_URL, OLLAMA_USAGE_URL, ollamaUpstreamHeaders, parseOllamaMe, } from './ollama/index.js';
import { KIMI_ME_URL, KIMI_USAGE_URL, kimiUpstreamHeaders, parseKimiUserInfo } from './kimi/index.js';
import { opencodeDefaultAccount } from './opencode/index.js';
import { COPILOT_QUOTA_URL, copilotIdentityHeaders, isGithubUserToken, parseCopilotUser } from './copilot/index.js';
export const QUOTA_TTL_MS = 60_000;
export const QUOTA_TIMEOUT_MS = 10_000;
const USED_RESET_STATUS = new Set(['redeemed', 'used', 'consumed', 'expired']);
export function asNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const next = Number(value);
        if (Number.isFinite(next))
            return next;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('val' in value)
            return asNumber(value.val);
        if ('value' in value)
            return asNumber(value.value);
    }
    return undefined;
}
function clampPct(value) {
    const n = asNumber(value);
    if (n === undefined)
        return undefined;
    return Math.max(0, Math.min(100, Math.round(n)));
}
export function creditBagAmounts(value) {
    if (Array.isArray(value)) {
        for (const item of value) {
            const bag = creditBagAmounts(item);
            if (bag)
                return bag;
        }
        return undefined;
    }
    if (!value || typeof value !== 'object')
        return undefined;
    const total = asNumber(value.total ?? value.limit ?? value.cap ?? value.allocation ?? value.amount);
    const used = asNumber(value.used ?? value.spent ?? value.consumed ?? value.usage);
    const remaining = asNumber(value.remaining ?? value.balance ?? value.left);
    if (total === undefined && used === undefined && remaining === undefined) {
        return creditBagAmounts(value.bags ?? value.items);
    }
    const resolvedUsed = used ?? (total !== undefined && remaining !== undefined ? Math.max(0, total - remaining) : undefined);
    const resolvedRemaining = remaining ?? (total !== undefined && resolvedUsed !== undefined ? Math.max(0, total - resolvedUsed) : undefined);
    return { used: resolvedUsed, total, remaining: resolvedRemaining };
}
function creditBagUsedPercent(value) {
    const bag = creditBagAmounts(value);
    if (!bag || bag.total === undefined || bag.total <= 0 || bag.used === undefined)
        return undefined;
    return clampPct((bag.used / bag.total) * 100);
}
export function stampOf(value) {
    const n = asNumber(value);
    if (n !== undefined && n > 0)
        return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
function resetAtOf(window) {
    const stamp = stampOf(window?.reset_at
        ?? window?.resetAt
        ?? window?.resets_at
        ?? window?.resetsAt
        ?? window?.reset_time
        ?? window?.resetTime);
    if (stamp !== undefined)
        return stamp;
    const after = asNumber(window?.reset_after_seconds
        ?? window?.resetAfterSeconds
        ?? window?.seconds_until_reset
        ?? window?.secondsUntilReset
        ?? window?.reset_after
        ?? window?.resetAfter);
    if (after !== undefined && after >= 0)
        return Date.now() + after * 1000;
    return undefined;
}
function parseCodexWindow(window) {
    if (!window || typeof window !== 'object')
        return undefined;
    const usedPercent = clampPct(window.used_percent ?? window.usedPercent ?? 0) ?? 0;
    const seconds = asNumber(window.limit_window_seconds ?? window.limitWindowSeconds);
    return {
        usedPercent,
        remainingPercent: 100 - usedPercent,
        windowMinutes: seconds !== undefined && seconds > 0 ? Math.floor((seconds + 59) / 60) : undefined,
        resetAt: resetAtOf(window),
    };
}
export function parseCodexUsage(payload) {
    if (!payload || typeof payload !== 'object')
        return { rows: [] };
    const rate = payload.rate_limit ?? payload.rateLimit;
    const primary = parseCodexWindow(rate?.primary_window ?? rate?.primaryWindow);
    const secondary = parseCodexWindow(rate?.secondary_window ?? rate?.secondaryWindow);
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
    const planType = typeof payload.plan_type === 'string' && payload.plan_type
        ? payload.plan_type
        : typeof payload.planType === 'string' ? payload.planType : undefined;
    return { planType, rows };
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
export function isAvailableResetCredit(credit) {
    if (!credit)
        return false;
    const status = (credit.status ?? 'available').trim().toLowerCase();
    if (USED_RESET_STATUS.has(status))
        return false;
    if (credit.expiresAt !== undefined)
        return credit.expiresAt > Date.now();
    return true;
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
        .map((credit) => credit.expiresAt)
        .filter((stamp) => typeof stamp === 'number')
        .sort((a, b) => a - b)[0];
    const nextExpiresAt = fromCredits ?? listedExpiry;
    return {
        availableCount,
        credits,
        ...(nextExpiresAt === undefined ? {} : { nextExpiresAt }),
    };
}
function publicResetCredits(value) {
    if (!value)
        return { availableCount: 0, credits: [] };
    const available = (value.credits ?? []).filter(isAvailableResetCredit).map((credit) => ({
        id: credit.id,
        expiresAt: credit.expiresAt,
    }));
    const nextExpiresAt = value.nextExpiresAt;
    let credits = available;
    if (credits.length === 0 && (value.availableCount ?? 0) > 0) {
        const count = Math.max(0, Math.round(value.availableCount));
        credits = Array.from({ length: count }, (_, index) => ({
            id: `available-${index + 1}`,
            expiresAt: nextExpiresAt,
        }));
    }
    return {
        availableCount: value.availableCount ?? credits.length,
        credits,
        ...(nextExpiresAt === undefined ? {} : { nextExpiresAt }),
    };
}
function creditUsageSources(billing, config) {
    return [
        billing?.credits,
        billing?.creditBalance,
        billing?.usage,
        config?.credits,
        config?.includedCredits,
        config?.subscriptionCredits,
        config?.weeklyCredits,
        config?.sharedPool,
    ];
}
function grokOnDemandBag(billing, config) {
    const used = asNumber(config.onDemandUsed
        ?? config.on_demand_used
        ?? billing.onDemandUsed
        ?? billing.on_demand_used);
    const total = asNumber(config.onDemandCap
        ?? config.on_demand_cap
        ?? billing.onDemandCap
        ?? billing.on_demand_cap);
    if (used === undefined && total === undefined)
        return undefined;
    const remaining = total !== undefined && used !== undefined ? Math.max(0, total - used) : undefined;
    return { used, total, remaining };
}
function grokMonthlyBag(billing, config) {
    const used = asNumber(config.used
        ?? billing.usage?.includedUsed
        ?? billing.usage?.totalUsed
        ?? billing.includedUsed);
    const total = asNumber(config.monthlyLimit
        ?? config.monthly_limit
        ?? billing.monthlyLimit
        ?? billing.monthly_limit);
    if (total === undefined || total <= 0)
        return undefined;
    const remaining = used !== undefined ? Math.max(0, total - used) : undefined;
    return { used, total, remaining };
}
function grokWindowKind(periodType) {
    const text = String(periodType ?? '');
    if (/month/i.test(text))
        return 'cycle';
    return 'weekly';
}
function productRow(item) {
    if (!item || typeof item !== 'object')
        return undefined;
    const product = item.product ?? item.name ?? item.productName;
    if (typeof product !== 'string' || product.length === 0)
        return undefined;
    const bag = creditBagAmounts(item) ?? {};
    const usedPercent = clampPct(item.usagePercent ?? item.usedPercent ?? item.usage_percent)
        ?? (bag.total > 0 && bag.used !== undefined ? clampPct((bag.used / bag.total) * 100) : undefined);
    if (usedPercent === undefined && bag.used === undefined && bag.total === undefined)
        return undefined;
    const remainingPercent = usedPercent === undefined ? undefined : 100 - usedPercent;
    return {
        key: `product:${product}`,
        kind: 'product',
        product,
        usedPercent,
        remainingPercent,
        used: bag.used,
        total: bag.total,
        remaining: bag.remaining,
    };
}
function userPayload(cliUser) {
    if (!cliUser || typeof cliUser !== 'object')
        return {};
    return cliUser.user ?? cliUser.profile ?? cliUser;
}
function periodResetAt(end) {
    if (typeof end !== 'string' || end.length === 0)
        return undefined;
    const stamp = Date.parse(end);
    return Number.isFinite(stamp) ? stamp : undefined;
}
export function parseGrokBilling(billing, { cliUser } = {}) {
    if (!billing || typeof billing !== 'object')
        return { rows: [] };
    const config = billing.config && typeof billing.config === 'object' ? billing.config : billing;
    const period = config.currentPeriod && typeof config.currentPeriod === 'object'
        ? config.currentPeriod
        : config.current_period && typeof config.current_period === 'object'
            ? config.current_period
            : {};
    const user = userPayload(cliUser);
    const subscription = user.subscription ?? cliUser?.subscription ?? config.subscription;
    const subscriptionTier = formatPlanLabel(grokTierFromValue(pickPlanRaw(config.subscription_tier, config.subscriptionTier, billing.subscription_tier, billing.subscriptionTier, subscription?.tier, user.subscriptionTier, user.subscription_tier)));
    const subscriptionStatus = typeof subscription?.status === 'string' ? subscription.status : undefined;
    const hasGrokCodeAccess = user.hasGrokCodeAccess ?? user.has_grok_code_access ?? cliUser?.hasGrokCodeAccess;
    let usedPercent = clampPct(config.creditUsagePercent ?? config.credit_usage_percent);
    const onDemand = grokOnDemandBag(billing, config);
    const monthly = grokMonthlyBag(billing, config);
    const amounts = creditUsageSources(billing, config)
        .map((source) => (source === undefined ? undefined : creditBagAmounts(source)))
        .find((bag) => bag && (bag.used !== undefined || bag.total !== undefined))
        ?? onDemand
        ?? monthly;
    if (usedPercent === undefined && amounts)
        usedPercent = creditBagUsedPercent(amounts) ?? undefined;
    const remainingPercent = usedPercent === undefined ? undefined : 100 - usedPercent;
    const periodType = typeof period.type === 'string'
        ? period.type
        : typeof period.periodType === 'string'
            ? period.periodType
            : undefined;
    const resetAt = periodResetAt(period.end ?? config.billingPeriodEnd ?? config.billing_period_end);
    const rows = [];
    if (usedPercent !== undefined || amounts?.used !== undefined || amounts?.total !== undefined) {
        rows.push({
            key: grokWindowKind(periodType) === 'weekly' ? 'weekly' : 'cycle',
            kind: grokWindowKind(periodType),
            usedPercent,
            remainingPercent,
            used: amounts?.used,
            total: amounts?.total,
            remaining: amounts?.remaining,
            resetAt,
            periodType,
            periodStart: typeof period.start === 'string' ? period.start : config.billingPeriodStart,
            periodEnd: typeof period.end === 'string' ? period.end : config.billingPeriodEnd,
        });
    }
    const prepaid = asNumber(config.prepaidBalance
        ?? config.prepaid_balance
        ?? billing.prepaidBalance
        ?? billing.prepaid_balance);
    if (prepaid !== undefined && prepaid > 0) {
        rows.push({ key: 'prepaid', kind: 'prepaid', remaining: prepaid });
    }
    const products = Array.isArray(config.productUsage)
        ? config.productUsage
        : Array.isArray(config.product_usage)
            ? config.product_usage
            : [];
    for (const item of products.slice(0, 4)) {
        const row = productRow(item);
        if (row)
            rows.push(row);
    }
    return {
        planType: subscriptionTier,
        subscriptionStatus,
        hasGrokCodeAccess: typeof hasGrokCodeAccess === 'boolean' ? hasGrokCodeAccess : undefined,
        rows,
    };
}
export function applyGrokCreditsSnapshot(parsed, snapshot) {
    const base = parsed && typeof parsed === 'object' ? parsed : { rows: [] };
    const rows = Array.isArray(base.rows) ? [...base.rows] : [];
    if (!snapshot || typeof snapshot !== 'object')
        return { ...base, rows };
    const idx = rows.findIndex((row) => row.kind === 'cycle' || row.kind === 'weekly');
    const current = idx >= 0 ? rows[idx] : undefined;
    if (current?.usedPercent !== undefined) {
        if (current.resetAt === undefined && snapshot.resetAt !== undefined) {
            rows[idx] = { ...current, resetAt: snapshot.resetAt };
        }
        return { ...base, rows };
    }
    if (snapshot.usedPercent === undefined && snapshot.resetAt === undefined)
        return { ...base, rows };
    const usedPercent = snapshot.usedPercent;
    const next = {
        key: 'weekly',
        kind: 'weekly',
        usedPercent,
        remainingPercent: usedPercent === undefined ? undefined : 100 - usedPercent,
        resetAt: snapshot.resetAt ?? current?.resetAt,
        periodType: current?.periodType ?? 'USAGE_PERIOD_TYPE_WEEKLY',
        periodStart: current?.periodStart,
        periodEnd: current?.periodEnd,
        used: current?.used,
        total: current?.total,
        remaining: current?.remaining,
    };
    if (idx >= 0)
        rows[idx] = { ...current, ...next };
    else
        rows.unshift(next);
    return { ...base, rows };
}
function glmKindBlob(item) {
    return [
        item?.type,
        item?.limitType,
        item?.name,
        item?.showName,
        item?.show_name,
        item?.duration,
        item?.window,
        item?.timeUnit,
        item?.period,
        item?.product,
        item?.kind,
        item?.category,
        item?.quotaType,
    ].filter((part) => part != null && String(part).trim()).join(' ');
}
function glmDetailsLookLikeMcp(item) {
    const details = item?.usageDetails ?? item?.usage_details ?? item?.tools;
    if (!Array.isArray(details))
        return false;
    return details.some((row) => /search-prime|web-reader|zread|mcp|web.?search/i.test(String(row?.modelCode ?? row?.name ?? row?.product ?? '')));
}
export function glmWindowKind(item) {
    if (!item || typeof item !== 'object')
        return 'cycle';
    const text = glmKindBlob(item);
    const unit = asNumber(item.unit);
    const number = asNumber(item.number);
    if (/mcp|zread|web.?search|web.?reader|search-prime|time_limit|\btools?\b/i.test(text) || glmDetailsLookLikeMcp(item)) {
        return 'mcp';
    }
    if (unit === 5)
        return 'mcp';
    if (/week|7d|weekly/i.test(text))
        return 'weekly';
    if (unit === 6 && (number === 1 || number === 7))
        return 'weekly';
    if (/5h|5\s*hour|five.?hour|primary/i.test(text))
        return 'primary';
    if (unit === 3 && number === 5)
        return 'primary';
    if (/credit_limit|tokens_limit|credit/i.test(text)) {
        const total = asNumber(item.usage ?? item.total ?? item.limit ?? item.amount);
        if (total === 10_000 || total === 60_000 || total === 140_000)
            return 'weekly';
        return 'primary';
    }
    return 'cycle';
}
function glmWindowKey(kind, type, window) {
    if (kind === 'primary' || kind === 'weekly' || kind === 'mcp')
        return kind;
    const slug = String(window ?? type ?? 'limit').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `glm:${slug}`;
}
function glmItemBag(item) {
    const total = asNumber(item.usage ?? item.total ?? item.limit ?? item.amount);
    const used = asNumber(item.currentValue ?? item.used ?? item.spend ?? item.consumed);
    const remaining = asNumber(item.remaining)
        ?? (total !== undefined && used !== undefined ? Math.max(0, total - used) : undefined);
    if (total !== undefined || used !== undefined || remaining !== undefined) {
        return { used, total, remaining };
    }
    const details = item.usageDetails ?? item.usage_details;
    if (Array.isArray(details) && details.length > 0) {
        let detailUsed = 0;
        let saw = false;
        for (const row of details) {
            const amount = asNumber(row?.usage ?? row?.used ?? row?.currentValue);
            if (amount !== undefined) {
                detailUsed += amount;
                saw = true;
            }
        }
        if (saw)
            return { used: detailUsed, total: undefined, remaining: undefined };
    }
    return undefined;
}
function preferGlmRow(previous, next) {
    if (!previous)
        return next;
    const prevUsed = previous.used ?? 0;
    const nextUsed = next.used ?? 0;
    if (nextUsed > prevUsed)
        return next;
    if (previous.total === undefined && next.total !== undefined)
        return next;
    return previous;
}
function finalizeGlmRows(rows) {
    const byKind = new Map();
    for (const row of rows) {
        const kind = row.kind === 'product' && /mcp|zread|web.?search/i.test(row.product ?? '')
            ? 'mcp'
            : row.kind;
        const next = kind === row.kind ? row : { ...row, kind, key: 'mcp', product: row.product ?? 'ZCode MCP' };
        byKind.set(kind, preferGlmRow(byKind.get(kind), next));
    }
    const ordered = [];
    for (const kind of ['primary', 'weekly', 'mcp']) {
        const row = byKind.get(kind);
        if (row)
            ordered.push({ ...row, key: kind, kind });
    }
    return ordered;
}
function glmRowFromItem(item) {
    const bag = glmItemBag(item);
    if (!bag) {
        const usedPercent = clampPct(item.percentage ?? item.usedPercent ?? item.used_percent);
        if (usedPercent === undefined)
            return undefined;
        const kind = glmWindowKind(item);
        return {
            key: glmWindowKey(kind, item.type, item.duration ?? item.window),
            kind,
            usedPercent,
            remainingPercent: 100 - usedPercent,
            resetAt: stampOf(item.resetAt ?? item.reset_at ?? item.nextResetAt ?? item.nextResetTime ?? item.expireAt),
        };
    }
    const usedPercent = clampPct(item.percentage ?? item.usedPercent ?? item.used_percent)
        ?? (bag.total > 0 && bag.used !== undefined ? clampPct((bag.used / bag.total) * 100) : undefined);
    const remainingPercent = usedPercent === undefined ? undefined : 100 - usedPercent;
    const kind = glmWindowKind(item);
    return {
        key: glmWindowKey(kind, item.type, item.duration ?? item.window),
        kind,
        usedPercent,
        remainingPercent,
        used: bag.used,
        total: bag.total,
        remaining: bag.remaining,
        resetAt: stampOf(item.resetAt ?? item.reset_at ?? item.nextResetAt ?? item.nextResetTime ?? item.expireAt),
        ...(kind === 'mcp' ? { product: 'ZCode MCP' } : {}),
    };
}
function collectGlmItems(root) {
    const primary = root.list ?? root.limits ?? root.items ?? root.quotaLimits ?? root.quota_limits ?? root.balances;
    const items = Array.isArray(primary) ? [...primary] : [];
    const mcpBag = root.mcp ?? root.mcpQuota ?? root.monthlyMCP ?? root.monthlyMCPUsage ?? root.toolUsage ?? root.tools;
    if (mcpBag && typeof mcpBag === 'object' && !Array.isArray(mcpBag)) {
        items.push({ type: 'TIME_LIMIT', ...mcpBag });
    }
    return items;
}
export function parseGlmQuota(payload) {
    const root = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    if (!root || typeof root !== 'object')
        return { rows: [] };
    const planType = formatPlanLabel(pickPlanRaw(root.level, root.planType, root.plan, root.subscriptionLevel), 'glm');
    const rows = [];
    for (const item of collectGlmItems(root)) {
        if (!item || typeof item !== 'object')
            continue;
        const row = glmRowFromItem(item);
        if (row)
            rows.push(row);
    }
    if (rows.length === 0) {
        const bag = creditBagAmounts(root.credits ?? root);
        if (bag && (bag.used !== undefined || bag.total !== undefined || bag.remaining !== undefined)) {
            const usedPercent = creditBagUsedPercent(bag);
            rows.push({
                key: 'primary',
                kind: 'primary',
                usedPercent,
                remainingPercent: usedPercent === undefined ? undefined : 100 - usedPercent,
                used: bag.used,
                total: bag.total,
                remaining: bag.remaining,
            });
        }
    }
    return { planType, rows: finalizeGlmRows(rows) };
}
export function mergeGlmToolUsage(parsed, toolPayload) {
    const base = parsed && typeof parsed === 'object' ? parsed : { rows: [] };
    const rows = Array.isArray(base.rows) ? [...base.rows] : [];
    if (rows.some((row) => row.kind === 'mcp'))
        return { ...base, rows: finalizeGlmRows(rows) };
    const extra = parseGlmQuota(toolPayload);
    const mcp = extra.rows.find((row) => row.kind === 'mcp');
    if (!mcp)
        return { ...base, rows: finalizeGlmRows(rows) };
    return { ...base, rows: finalizeGlmRows([...rows, mcp]) };
}
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
function clampUsedPct(value) {
    const n = asNumber(value);
    if (n === undefined)
        return undefined;
    const clamped = Math.max(0, Math.min(100, n));
    const rounded = Math.round(clamped);
    if (clamped > 0 && rounded === 0)
        return 1;
    return rounded;
}
function cursorProductRow(key, usedPercent, resetAt) {
    const used = clampUsedPct(usedPercent) ?? 0;
    return {
        key: `product:${key}`,
        kind: 'product',
        product: key,
        usedPercent: used,
        remainingPercent: 100 - used,
        ...(resetAt === undefined ? {} : { resetAt }),
    };
}
export function parseCursorPeriodUsage(payload, extras = {}) {
    if (!payload || typeof payload !== 'object')
        return { rows: [] };
    const planUsage = payload.planUsage && typeof payload.planUsage === 'object' ? payload.planUsage : {};
    const spend = payload.spendLimitUsage && typeof payload.spendLimitUsage === 'object' ? payload.spendLimitUsage : {};
    const stripe = extras.stripe && typeof extras.stripe === 'object' ? extras.stripe : {};
    const limitType = typeof spend.limitType === 'string' ? spend.limitType : undefined;
    const membership = pickPlanRaw(cursorMembershipFromStripe(stripe), extras.planType, payload.individualMembershipType, payload.membershipType, limitType === 'team' ? 'Team' : undefined, 'Pro');
    const resetAt = stampOf(payload.billingCycleEnd);
    return {
        planType: membership,
        account: pickCursorHumanAccount(extras.account, extras.email, payload.email),
        rows: [
            cursorProductRow('auto', planUsage.autoPercentUsed, resetAt),
            cursorProductRow('api', planUsage.apiPercentUsed, resetAt),
        ],
    };
}
async function fetchCursorJson(fetchFn, url, init, label) {
    try {
        const response = await fetchFn(url, init);
        if (!response?.ok)
            return undefined;
        return await readJson(response, label);
    }
    catch {
        return undefined;
    }
}
export async function fetchCursorQuota(session, fetchFn = fetch) {
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
    const headers = cursorUsageHeaders(session);
    try {
        const [usageRes, stripe, emailProfile] = await Promise.all([
            fetchFn(CURSOR_USAGE_URL, {
                method: 'POST',
                headers,
                body: '{}',
                signal: wait.signal,
            }),
            fetchCursorJson(fetchFn, CURSOR_STRIPE_PROFILE_URL, {
                method: 'GET',
                headers,
                signal: wait.signal,
            }, 'cursor stripe profile'),
            fetchCursorJson(fetchFn, CURSOR_GET_EMAIL_URL, {
                method: 'POST',
                headers,
                body: '{}',
                signal: wait.signal,
            }, 'cursor email'),
        ]);
        if (!usageRes.ok)
            throw new Error(`cursor quota failed (HTTP ${usageRes.status})`);
        let account = cursorNameFromProfile(emailProfile);
        if (!account) {
            const me = await fetchCursorJson(fetchFn, CURSOR_GET_ME_URL, {
                method: 'POST',
                headers,
                body: '{}',
                signal: wait.signal,
            }, 'cursor me');
            account = cursorNameFromProfile(me);
        }
        return parseCursorPeriodUsage(await readJson(usageRes, 'cursor period usage'), { stripe, account });
    }
    finally {
        wait.cancel();
    }
}
/** ollama.com /api/usage `limits.*.usage` is a 0..1 fraction, not 0–100. */
function ollamaUsedPercent(value) {
    const n = asNumber(value);
    if (n === undefined)
        return undefined;
    const used = n <= 1 ? n * 100 : n;
    return Math.max(0, Math.min(100, Math.round(used * 10) / 10));
}
function ollamaModelsNote(models) {
    if (!Array.isArray(models) || models.length === 0)
        return undefined;
    const parts = [];
    for (const item of models) {
        if (!item || typeof item !== 'object')
            continue;
        const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined;
        if (!name)
            continue;
        const count = asNumber(item.request_count ?? item.requestCount) ?? 0;
        parts.push(`${name} × ${count}`);
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
}
/** Global 5h unix buckets. ollama/ollama#12532: `18000 - (epoch % 18000)`. */
export const OLLAMA_SESSION_WINDOW_S = 18_000;
export function ollamaSessionResetAt(now = Date.now()) {
    const epoch = Math.floor(now / 1000);
    return (Math.floor(epoch / OLLAMA_SESSION_WINDOW_S) + 1) * OLLAMA_SESSION_WINDOW_S * 1000;
}
function ollamaWindowResetAt(window, kind, now = Date.now()) {
    const stamp = resetAtOf(window) ?? stampOf(window?.next_reset ?? window?.nextReset);
    if (stamp !== undefined)
        return stamp;
    if (kind === 'primary')
        return ollamaSessionResetAt(now);
    return undefined;
}
function parseOllamaLimitWindow(window, kind, now = Date.now()) {
    if (!window || typeof window !== 'object')
        return undefined;
    const usedPercent = ollamaUsedPercent(window.usage);
    if (usedPercent === undefined)
        return undefined;
    const remainingPercent = Math.max(0, Math.min(100, Math.round((100 - usedPercent) * 10) / 10));
    const note = kind === 'weekly' ? ollamaModelsNote(window.models) : undefined;
    const resetAt = ollamaWindowResetAt(window, kind, now);
    return {
        key: kind,
        kind,
        usedPercent,
        remainingPercent,
        ...(kind === 'primary' ? { windowMinutes: 300 } : {}),
        ...(resetAt !== undefined ? { resetAt } : {}),
        ...(note ? { note } : {}),
    };
}
export function parseOllamaUsage(payload, me, now = Date.now()) {
    const root = payload && typeof payload === 'object' ? payload : {};
    const limits = root.limits && typeof root.limits === 'object' ? root.limits : root;
    const identity = parseOllamaMe(me && typeof me === 'object' ? me : root);
    const rows = [];
    const session = parseOllamaLimitWindow(limits.session, 'primary', now);
    const weekly = parseOllamaLimitWindow(limits.weekly, 'weekly', now);
    if (session)
        rows.push(session);
    if (weekly)
        rows.push(weekly);
    return {
        planType: identity.planType,
        account: identity.account,
        rows,
    };
}
export async function fetchOllamaQuota(session, fetchFn = fetch) {
    const headers = ollamaUpstreamHeaders(session);
    const usageWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    const meWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const [usageResult, meResult] = await Promise.allSettled([
            fetchFn(OLLAMA_USAGE_URL, { method: 'GET', headers, signal: usageWait.signal })
                .then((response) => readJson(response, 'ollama usage')),
            fetchFn(OLLAMA_ME_URL, {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: '{}',
                signal: meWait.signal,
            }).then((response) => readJson(response, 'ollama me')),
        ]);
        if (usageResult.status === 'rejected' && meResult.status === 'rejected') {
            throw usageResult.reason;
        }
        const usage = usageResult.status === 'fulfilled' ? usageResult.value : {};
        const me = meResult.status === 'fulfilled' ? meResult.value : undefined;
        return parseOllamaUsage(usage, me);
    }
    finally {
        usageWait.cancel();
        meWait.cancel();
    }
}
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
export async function fetchKimiQuota(session, fetchFn = fetch) {
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
/** Go has no public usage API. Card still renders; quota rows stay empty. */
export async function fetchOpencodeQuota(session) {
    const account = typeof session?.account === 'string' && session.account.trim()
        ? session.account.trim()
        : opencodeDefaultAccount(session?.accessToken);
    return {
        planType: session?.planType === 'free' ? 'free' : 'go',
        account,
        rows: [],
    };
}
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
export async function fetchCopilotQuota(session, fetchFn = fetch) {
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
export async function fetchGlmQuota(session, fetchFn = fetch) {
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const response = await fetchFn(glmQuotaUrl(session.region), {
            method: 'GET',
            headers: glmUpstreamHeaders(session),
            signal: wait.signal,
        });
        const parsed = parseGlmQuota(await readJson(response, 'glm quota'));
        if (parsed.rows.some((row) => row.kind === 'mcp'))
            return parsed;
        const toolsWait = timeoutSignal(QUOTA_TIMEOUT_MS);
        try {
            const tools = await fetchFn(glmToolUsageUrl(session.region), {
                method: 'GET',
                headers: glmUpstreamHeaders(session),
                signal: toolsWait.signal,
            });
            return mergeGlmToolUsage(parsed, await readJson(tools, 'glm tool usage'));
        }
        catch {
            return parsed;
        }
        finally {
            toolsWait.cancel();
        }
    }
    finally {
        wait.cancel();
    }
}
function kiroUsageAttempts(session) {
    const arn = kiroEffectiveProfileArn(session);
    const attempts = [];
    for (const region of kiroUsageRegions(session)) {
        if (arn)
            attempts.push({ region, profileArn: arn });
        attempts.push({ region, profileArn: undefined });
    }
    return attempts;
}
function antigravityModelsMap(payload) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const models = payload.models;
    if (models && typeof models === 'object' && !Array.isArray(models))
        return models;
    if (!Array.isArray(payload))
        return payload;
    return undefined;
}
function findAntigravityModel(models, identifier) {
    if (Object.prototype.hasOwnProperty.call(models, identifier)) {
        return { id: identifier, entry: models[identifier] };
    }
    for (const [id, entry] of Object.entries(models)) {
        const display = entry && typeof entry === 'object' ? entry.displayName : undefined;
        if (typeof display === 'string' && display.toLowerCase() === identifier.toLowerCase()) {
            return { id, entry };
        }
    }
    return undefined;
}
function normalizeQuotaFraction(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value !== 'string')
        return undefined;
    const raw = value.trim();
    if (!raw)
        return undefined;
    if (raw.endsWith('%')) {
        const parsed = Number(raw.slice(0, -1).trim());
        return Number.isFinite(parsed) ? parsed / 100 : undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function antigravityQuotaInfo(entry) {
    if (!entry || typeof entry !== 'object')
        return undefined;
    const info = entry.quotaInfo ?? entry.quota_info;
    return info && typeof info === 'object' ? info : undefined;
}
function buildAntigravityQuotaRow(models, group) {
    const samples = [];
    let displayName;
    for (const identifier of group.identifiers) {
        const found = findAntigravityModel(models, identifier);
        if (!found)
            continue;
        const info = antigravityQuotaInfo(found.entry);
        const remaining = normalizeQuotaFraction(info?.remainingFraction ?? info?.remaining_fraction ?? info?.remaining);
        const stamp = resetAtOf(info);
        const hasReset = stamp !== undefined;
        const fraction = remaining ?? (hasReset ? 0 : undefined);
        if (fraction === undefined)
            return undefined;
        samples.push({ fraction, stamp });
        if (displayName === undefined) {
            const name = found.entry?.displayName;
            if (typeof name === 'string' && name.trim())
                displayName = name.trim();
        }
    }
    if (samples.length === 0)
        return undefined;
    const remaining = samples.reduce((lowest, next) => Math.min(lowest, next.fraction), 1);
    const remainingPercent = clampPct(remaining * 100) ?? 0;
    const usedPercent = Math.max(0, Math.min(100, 100 - remainingPercent));
    const product = group.labelFromModel ? (displayName ?? group.label) : group.label;
    const atFloor = samples.filter((sample) => sample.fraction === remaining);
    const resetAt = soonestReset(atFloor) ?? soonestReset(samples);
    return {
        key: `product:${product}`,
        kind: 'product',
        product,
        usedPercent,
        remainingPercent,
        ...(resetAt === undefined ? {} : { resetAt }),
    };
}
function soonestReset(samples) {
    const stamps = samples.map((sample) => sample.stamp).filter((stamp) => typeof stamp === 'number');
    return stamps.length > 0 ? Math.min(...stamps) : undefined;
}
/** SkillStar `parse_model_windows` — group fetchAvailableModels into product bars. */
export function parseAntigravityModelQuota(payload) {
    const models = antigravityModelsMap(payload);
    if (!models)
        return { rows: [] };
    const rows = [];
    for (const group of ANTIGRAVITY_QUOTA_GROUPS) {
        const row = buildAntigravityQuotaRow(models, group);
        if (row)
            rows.push(row);
    }
    return { rows };
}
function remainingOfBucket(bucket) {
    if (!bucket || typeof bucket !== 'object')
        return undefined;
    const nested = bucket.remaining && typeof bucket.remaining === 'object' ? bucket.remaining : undefined;
    return normalizeQuotaFraction(bucket.remainingFraction
        ?? bucket.remaining_fraction
        ?? nested?.remainingFraction
        ?? nested?.remaining_fraction
        ?? nested?.remaining
        ?? bucket.remaining);
}
function classifyQuotaWindow(bucket) {
    const window = String(bucket?.window ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (window === 'weekly' || window === 'week')
        return 'weekly';
    if (window === 'fivehour' || window === '5h' || window === '5hour' || window === 'session')
        return 'primary';
    const text = [
        bucket?.window,
        bucket?.bucketId,
        bucket?.bucket_id,
        bucket?.displayName,
        bucket?.display_name,
        bucket?.description,
    ].filter((value) => typeof value === 'string').join(' ');
    if (/week/i.test(text))
        return 'weekly';
    if (/5\s*-?h|five.?hour|session|rolling/i.test(text))
        return 'primary';
    return undefined;
}
function antigravityGroupSlug(title) {
    return String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}
/** Official Model Quota panel: Gemini Models / Claude and GPT models × weekly + 5-hour. */
export function parseAntigravityQuotaSummary(payload) {
    const root = payload?.response && typeof payload.response === 'object' ? payload.response : payload;
    const groups = Array.isArray(root?.groups) ? root.groups : [];
    const rows = [];
    for (const group of groups) {
        const title = typeof group?.displayName === 'string' && group.displayName.trim()
            ? group.displayName.trim()
            : (typeof group?.display_name === 'string' && group.display_name.trim() ? group.display_name.trim() : undefined);
        if (!title)
            continue;
        const buckets = Array.isArray(group.buckets) ? group.buckets : [];
        const windows = [];
        const pending = [];
        for (const bucket of buckets) {
            const remaining = remainingOfBucket(bucket);
            if (remaining === undefined)
                continue;
            const nested = bucket?.remaining && typeof bucket.remaining === 'object' ? bucket.remaining : undefined;
            const item = {
                kind: classifyQuotaWindow(bucket),
                remaining,
                resetAt: resetAtOf(bucket) ?? resetAtOf(nested),
            };
            if (item.kind)
                windows.push(item);
            else
                pending.push(item);
        }
        if (windows.length === 0 && pending.length > 0) {
            pending.forEach((item, index) => {
                item.kind = index === 0 ? 'weekly' : 'primary';
            });
            windows.push(...pending);
        }
        else if (pending.length > 0 && windows.length === 1) {
            pending[0].kind = windows[0].kind === 'weekly' ? 'primary' : 'weekly';
            windows.push(pending[0]);
        }
        if (windows.length === 0)
            continue;
        const slug = antigravityGroupSlug(title);
        rows.push({ key: `heading:${slug}`, kind: 'heading', product: title });
        const order = ['weekly', 'primary'];
        windows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
        for (const win of windows) {
            const remainingPercent = clampPct(win.remaining * 100) ?? 0;
            rows.push({
                key: `${slug}:${win.kind}`,
                kind: win.kind,
                product: title,
                remainingPercent,
                usedPercent: Math.max(0, Math.min(100, 100 - remainingPercent)),
                ...(win.resetAt === undefined ? {} : { resetAt: win.resetAt }),
                ...(win.kind === 'primary' ? { windowMinutes: 300 } : {}),
            });
        }
    }
    return { rows, planType: antigravityPlanType(root) ?? antigravityPlanType(payload) };
}
export function parseAntigravityPaidCredits(payload) {
    const credits = payload?.paidTier?.availableCredits ?? payload?.paid_tier?.availableCredits;
    if (!Array.isArray(credits))
        return [];
    const rows = [];
    for (const entry of credits) {
        if (!entry || typeof entry !== 'object')
            continue;
        const creditType = entry.creditType ?? entry.credit_type;
        if (typeof creditType !== 'string' || !creditType.trim())
            continue;
        const remaining = asNumber(entry.creditAmount ?? entry.credit_amount);
        if (remaining === undefined)
            continue;
        rows.push({
            key: `prepaid:${creditType.trim()}`,
            kind: 'prepaid',
            remaining,
        });
    }
    return rows;
}
export function pickAntigravityPlanName(payload) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const fromTiers = antigravityPlanType(payload);
    if (fromTiers)
        return fromTiers;
    const tiers = Array.isArray(payload.allowedTiers) ? payload.allowedTiers : [];
    const fallback = tiers.find((entry) => entry?.isDefault) ?? tiers[0];
    const id = fallback?.id;
    return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}
function isQuotaHttpStatus(error, status) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(`HTTP ${status}`) || (status === 400 && /bad request/i.test(message));
}
async function loadAntigravityCodeAssistForQuota(session, fetchFn) {
    const cached = typeof session.projectId === 'string' ? session.projectId : undefined;
    const post = async (projectId) => {
        const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
        try {
            const response = await fetchAntigravityCloudCode(ANTIGRAVITY_LOAD_CODE_ASSIST_URL, {
                method: 'POST',
                headers: antigravityLoadCodeAssistHeaders(session.accessToken),
                body: JSON.stringify(antigravityLoadCodeAssistBody(projectId)),
                signal: wait.signal,
            }, fetchFn);
            return await readJson(response, 'antigravity loadCodeAssist');
        }
        finally {
            wait.cancel();
        }
    };
    try {
        return await post(cached);
    }
    catch (error) {
        if (isQuotaHttpStatus(error, 401))
            throw error;
        if (cached && isQuotaHttpStatus(error, 400))
            return post(undefined);
        throw error;
    }
}
async function fetchAntigravityModelWindows(accessToken, projectId, fetchFn) {
    const payload = projectId ? { project: projectId } : {};
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const response = await fetchAntigravityCloudCode(ANTIGRAVITY_MODELS_URL, {
            method: 'POST',
            headers: antigravityLoadCodeAssistHeaders(accessToken),
            body: JSON.stringify(payload),
            signal: wait.signal,
        }, fetchFn);
        if (response.status === 401) {
            const text = await response.text();
            throw new Error(`antigravity fetchAvailableModels failed (HTTP 401)${text ? `: ${text.slice(0, 180)}` : ''}`);
        }
        if (!response.ok) {
            throw new Error(`antigravity fetchAvailableModels failed (HTTP ${response.status})`);
        }
        return parseAntigravityModelQuota(await readJson(response, 'antigravity fetchAvailableModels')).rows;
    }
    finally {
        wait.cancel();
    }
}
async function fetchAntigravityQuotaSummary(accessToken, projectId, fetchFn) {
    const payload = projectId ? { project: projectId } : {};
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const response = await fetchAntigravityCloudCode(ANTIGRAVITY_QUOTA_SUMMARY_URL, {
            method: 'POST',
            headers: antigravityLoadCodeAssistHeaders(accessToken),
            body: JSON.stringify(payload),
            signal: wait.signal,
        }, fetchFn);
        if (response.status === 401) {
            const text = await response.text();
            throw new Error(`antigravity retrieveUserQuotaSummary failed (HTTP 401)${text ? `: ${text.slice(0, 180)}` : ''}`);
        }
        if (!response.ok)
            return { rows: [] };
        return parseAntigravityQuotaSummary(await readJson(response, 'antigravity retrieveUserQuotaSummary'));
    }
    finally {
        wait.cancel();
    }
}
function pickGoogleAiPlan(...values) {
    for (const value of values) {
        if (typeof value !== 'string' || !value.trim())
            continue;
        if (isCodeAssistOnlyPlan(value))
            continue;
        return value.trim();
    }
    return undefined;
}
export async function fetchAntigravityQuota(session, fetchFn = fetch) {
    const load = await loadAntigravityCodeAssistForQuota(session, fetchFn);
    const projectId = extractCloudaicompanionProject(load)
        ?? (typeof session.projectId === 'string' && session.projectId.trim() ? session.projectId.trim() : undefined);
    let summary;
    try {
        summary = await fetchAntigravityQuotaSummary(session.accessToken, projectId, fetchFn);
    }
    catch (error) {
        if (isQuotaHttpStatus(error, 401))
            throw error;
        summary = { rows: [] };
    }
    const rows = summary.rows.length
        ? summary.rows
        : await fetchAntigravityModelWindows(session.accessToken, projectId, fetchFn);
    const credits = parseAntigravityPaidCredits(load);
    const planType = pickGoogleAiPlan(summary.planType, antigravityPlanType(load), typeof session.planType === 'string' ? session.planType : undefined);
    return { planType, rows: [...rows, ...credits] };
}
export async function fetchKiroQuota(session, fetchFn = fetch) {
    const attempts = kiroUsageAttempts(session);
    let lastError;
    for (let index = 0; index < attempts.length; index++) {
        const attempt = attempts[index];
        const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
        try {
            const response = await fetchFn(kiroUsageUrl(attempt.region, attempt.profileArn), {
                method: 'GET',
                headers: kiroUsageHeaders(session),
                signal: wait.signal,
            });
            if (response.ok) {
                return parseKiroUsage(await readJson(response, 'kiro usage'));
            }
            const text = await response.text();
            lastError = new Error(`kiro usage failed (HTTP ${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
            if (response.status === 403 && index + 1 < attempts.length)
                continue;
            throw lastError;
        }
        finally {
            wait.cancel();
        }
    }
    throw lastError ?? new Error('kiro usage failed');
}
function grokQuotaHeaders(session) {
    return {
        ...grokUpstreamHeaders(session),
        'x-grok-client-version': GROK_CLIENT_VERSION,
        'x-grok-cli-version': GROK_CLIENT_VERSION,
        'x-grok-client-surface': 'grok-cli',
        'x-grok-client-identifier': 'dsh-plugin-oauth-subs',
    };
}
function timeoutSignal(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    if (typeof timer.unref === 'function')
        timer.unref();
    return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}
async function readJson(response, label) {
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${label} failed (HTTP ${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
    }
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(`${label} returned non-JSON`);
    }
}
export async function fetchCodexQuota(session, fetchFn = fetch) {
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
export async function consumeCodexReset(session, fetchFn = fetch) {
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
export async function fetchGrokQuota(session, fetchFn = fetch) {
    const headers = grokQuotaHeaders(session);
    const billingWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    const userWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    const creditsWait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        const [billingResult, userResult, creditsResult] = await Promise.allSettled([
            fetchFn(GROK_BILLING_URL, { method: 'GET', headers, signal: billingWait.signal })
                .then((response) => readJson(response, 'grok billing')),
            fetchFn(GROK_CLI_USER_URL, { method: 'GET', headers, signal: userWait.signal })
                .then((response) => readJson(response, 'grok user')),
            fetchFn(GROK_CREDITS_URL, {
                method: 'POST',
                headers: grokCreditsHeaders(session),
                body: GROK_WEB_EMPTY_FRAME,
                signal: creditsWait.signal,
            }).then(async (response) => {
                if (!response.ok) {
                    throw new Error(`grok credits failed (HTTP ${response.status})`);
                }
                const decoded = decodeGrokCreditsFrame(Buffer.from(await response.arrayBuffer()));
                if (!decoded)
                    throw new Error('grok credits returned no usage');
                return decoded;
            }),
        ]);
        if (billingResult.status === 'rejected' && creditsResult.status === 'rejected') {
            throw billingResult.reason;
        }
        const billing = billingResult.status === 'fulfilled' ? billingResult.value : {};
        const cliUser = userResult.status === 'fulfilled' ? userResult.value : undefined;
        const snapshot = creditsResult.status === 'fulfilled' ? creditsResult.value : undefined;
        return applyGrokCreditsSnapshot(parseGrokBilling(billing, { cliUser }), snapshot);
    }
    finally {
        billingWait.cancel();
        userWait.cancel();
        creditsWait.cancel();
    }
}
function quotaCacheKey(provider, accountId) {
    return accountId ? `${provider}\0${accountId}` : provider;
}
function publicQuota(entry, provider) {
    if (!entry)
        return { status: 'idle' };
    return {
        status: entry.status,
        planType: entry.planType,
        planLabel: formatPlanLabel(entry.planType, provider),
        account: entry.account,
        subscriptionStatus: entry.subscriptionStatus,
        hasGrokCodeAccess: entry.hasGrokCodeAccess,
        updatedAt: entry.updatedAt,
        error: entry.error,
        rows: entry.rows ?? [],
        resetCredits: publicResetCredits(entry.resetCredits),
    };
}
export class QuotaStore {
    constructor({ tokens, fetchFn = fetch, ttlMs = QUOTA_TTL_MS } = {}) {
        this.tokens = tokens;
        this.fetchFn = fetchFn;
        this.ttlMs = ttlMs;
        this.cache = new Map();
        this.inflight = new Map();
    }
    peek(provider, accountId) {
        if (accountId)
            return publicQuota(this.cache.get(quotaCacheKey(provider, accountId)), provider);
        const exact = this.cache.get(provider);
        if (exact)
            return publicQuota(exact, provider);
        for (const [key, entry] of this.cache) {
            if (key.startsWith(`${provider}\0`))
                return publicQuota(entry, provider);
        }
        return publicQuota();
    }
    clear(provider, accountId) {
        if (!provider) {
            this.cache.clear();
            return;
        }
        if (accountId) {
            this.cache.delete(quotaCacheKey(provider, accountId));
            this.cache.delete(provider);
            return;
        }
        this.cache.delete(provider);
        for (const key of [...this.cache.keys()]) {
            if (key.startsWith(`${provider}\0`))
                this.cache.delete(key);
        }
    }
    async ensure(provider, accountId, session) {
        const live = session ?? await this.#activeSession(provider);
        const id = accountId ?? (live ? accountIdOf(provider, live) : undefined);
        const key = quotaCacheKey(provider, id);
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.updatedAt < this.ttlMs) {
            return publicQuota(cached, provider);
        }
        if (cached && cached.status === 'ready') {
            void this.refresh(provider, id, live);
            return publicQuota(cached, provider);
        }
        return this.refresh(provider, id, live);
    }
    async refresh(provider, accountId, session) {
        const live = session ?? await this.#activeSession(provider);
        const id = accountId ?? (live ? accountIdOf(provider, live) : undefined);
        const key = quotaCacheKey(provider, id);
        const pending = this.inflight.get(key);
        if (pending)
            return pending;
        const run = this.#load(provider, id, live).finally(() => this.inflight.delete(key));
        this.inflight.set(key, run);
        return run;
    }
    async consume(provider, accountId, session) {
        if (provider !== 'codex')
            throw new Error('only ChatGPT Codex can reset quota');
        const live = session ?? await this.#activeSession(provider);
        if (!live)
            throw new Error('ChatGPT Codex is not signed in');
        const id = accountId ?? accountIdOf('codex', live);
        const pending = this.inflight.get(quotaCacheKey('codex', id));
        if (pending)
            await pending.catch(() => undefined);
        await consumeCodexReset(live, this.fetchFn);
        this.cache.delete(quotaCacheKey('codex', id));
        return this.refresh('codex', id, live);
    }
    async #activeSession(provider) {
        const manager = this.tokens?.[provider];
        if (!manager || typeof manager.session !== 'function')
            return undefined;
        try {
            return await manager.session();
        }
        catch {
            return undefined;
        }
    }
    async #load(provider, accountId, session) {
        const key = quotaCacheKey(provider, accountId);
        if (!session) {
            this.cache.delete(key);
            return publicQuota();
        }
        const previous = this.cache.get(key);
        this.cache.set(key, {
            ...(previous ?? {}),
            status: previous?.status === 'ready' ? 'ready' : 'loading',
            updatedAt: previous?.updatedAt ?? Date.now(),
            rows: previous?.rows ?? [],
            resetCredits: previous?.resetCredits ?? { availableCount: 0 },
        });
        try {
            const parsed = provider === 'codex'
                ? await fetchCodexQuota(session, this.fetchFn)
                : provider === 'glm'
                    ? await fetchGlmQuota(session, this.fetchFn)
                    : provider === 'kiro'
                        ? await fetchKiroQuota(session, this.fetchFn)
                        : provider === 'antigravity'
                            ? await fetchAntigravityQuota(session, this.fetchFn)
                            : provider === 'cursor'
                                ? await fetchCursorQuota(session, this.fetchFn)
                                : provider === 'ollama'
                                    ? await fetchOllamaQuota(session, this.fetchFn)
                                    : provider === 'kimi'
                                        ? await fetchKimiQuota(session, this.fetchFn)
                                        : provider === 'opencode'
                                            ? await fetchOpencodeQuota(session)
                                            : provider === 'copilot'
                                                ? await fetchCopilotQuota(session, this.fetchFn)
                                                : await fetchGrokQuota(session, this.fetchFn);
            const entry = {
                status: 'ready',
                planType: parsed.planType,
                account: parsed.account,
                subscriptionStatus: parsed.subscriptionStatus,
                hasGrokCodeAccess: parsed.hasGrokCodeAccess,
                updatedAt: Date.now(),
                rows: parsed.rows ?? [],
                resetCredits: parsed.resetCredits ?? { availableCount: 0 },
            };
            this.cache.set(key, entry);
            return publicQuota(entry, provider);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const entry = {
                status: 'error',
                planType: previous?.planType,
                subscriptionStatus: previous?.subscriptionStatus,
                hasGrokCodeAccess: previous?.hasGrokCodeAccess,
                updatedAt: Date.now(),
                error: message,
                rows: previous?.rows ?? [],
                resetCredits: previous?.resetCredits ?? { availableCount: 0 },
            };
            this.cache.set(key, entry);
            return publicQuota(entry, provider);
        }
    }
}
