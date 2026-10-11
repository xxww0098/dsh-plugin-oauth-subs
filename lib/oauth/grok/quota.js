/**
 * Grok quota: GET cli-chat-proxy.grok.com/v1/billing?format=credits and
 * /v1/user?include=subscription, the grok.com gRPC-web credits config
 * (unified-billing plans omit the CLI percent), and the reset-card bank
 * (ConsumerUiSvc/GetRemainingResets, RedeemReset).
 *
 * creditUsagePercent is used-percent; the UI shows remaining. Unified-billing
 * SuperGrok / X Premium+ payloads often omit it on the CLI JSON; the grok.com
 * gRPC-web path still has the weekly pool.
 */
import { GROK_BILLING_URL, GROK_CLI_USER_URL, GROK_CLIENT_VERSION, GROK_CREDITS_URL, GROK_RESET_LIST_URL, GROK_RESET_REDEEM_URL, grokCreditsHeaders, grokResetHeaders, grokTierFromValue, grokUpstreamHeaders, } from './index.js';
import { decodeGrokCreditsFrame, GROK_WEB_EMPTY_FRAME } from './credits-frame.js';
import { decodeGrokResetTokens, grokRedeemOutcome, grokRedeemResetFrame, grokResetBank, grokResetCardId, grokRpcFrame, readGrokRpc, } from './reset-frame.js';
import { formatPlanLabel, pickPlanRaw } from '../plan.js';
import { outboundFetch } from '../../utils/outbound.js';
import { asNumber, clampPct, creditBagAmounts, creditBagUsedPercent, quotaReads, trimmedQuotaMsg, withQuotaTimeout, } from '../quota-shared.js';
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
/**
 * Grok money fields arrive as `{ val: <cents> }` (the `x.ai/billing` money
 * shape CodexBar documents). A `{ val }` object is cents → usd; a bare number
 * is a legacy/unitless credit figure and keeps that unit so old payloads
 * don't silently acquire a `$`.
 */
function grokMoneyAmount(value) {
    if (value && typeof value === 'object' && !Array.isArray(value) && 'val' in value) {
        const cents = asNumber(value.val);
        return cents === undefined ? undefined : { amount: cents / 100, usd: true };
    }
    const raw = asNumber(value);
    return raw === undefined ? undefined : { amount: raw, usd: false };
}
function grokOnDemandBag(billing, config) {
    const used = grokMoneyAmount(config.onDemandUsed
        ?? config.on_demand_used
        ?? billing.onDemandUsed
        ?? billing.on_demand_used);
    const total = grokMoneyAmount(config.onDemandCap
        ?? config.on_demand_cap
        ?? billing.onDemandCap
        ?? billing.on_demand_cap);
    if (total === undefined || total.amount <= 0)
        return undefined;
    const remaining = used !== undefined ? Math.max(0, total.amount - used.amount) : undefined;
    return { used: used?.amount, total: total.amount, remaining, usd: (used ?? total).usd };
}
function grokMonthlyBag(billing, config) {
    const used = grokMoneyAmount(config.used
        ?? config.usage?.includedUsed
        ?? config.usage?.totalUsed
        ?? billing.usage?.includedUsed
        ?? billing.usage?.totalUsed
        ?? billing.includedUsed);
    const total = grokMoneyAmount(config.monthlyLimit
        ?? config.monthly_limit
        ?? billing.monthlyLimit
        ?? billing.monthly_limit);
    if (total === undefined || total.amount <= 0)
        return undefined;
    const remaining = used !== undefined ? Math.max(0, total.amount - used.amount) : undefined;
    return { used: used?.amount, total: total.amount, remaining, usd: (used ?? total).usd };
}
function grokWindow(periodType) {
    const text = String(periodType ?? '');
    if (/month/i.test(text))
        return { kind: 'cycle' };
    if (/day|daily/i.test(text))
        return { kind: 'primary', windowMinutes: 24 * 60 };
    if (/hour/i.test(text)) {
        const hours = Number(text.replace(/\D+/g, ''));
        return { kind: 'primary', ...(hours > 0 ? { windowMinutes: hours * 60 } : {}) };
    }
    return { kind: 'weekly' };
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
    const generic = creditUsageSources(billing, config)
        .map((source) => (source === undefined ? undefined : creditBagAmounts(source)))
        .find((bag) => bag && (bag.used !== undefined || bag.total !== undefined));
    // The included pool (monthlyLimit + usage.*Used) is the canonical main bag;
    // generic credit buckets come next, pay-as-you-go last.
    const amounts = monthly ?? generic ?? onDemand;
    if (usedPercent === undefined && amounts)
        usedPercent = creditBagUsedPercent(amounts) ?? undefined;
    const remainingPercent = usedPercent === undefined ? undefined : 100 - usedPercent;
    const periodType = typeof period.type === 'string'
        ? period.type
        : typeof period.periodType === 'string'
            ? period.periodType
            : undefined;
    const resetAt = periodResetAt(period.end ?? config.billingPeriodEnd ?? config.billing_period_end ?? config.billingCycle?.billingPeriodEnd);
    const rows = [];
    const window = grokWindow(periodType);
    if (usedPercent !== undefined || amounts?.used !== undefined || amounts?.total !== undefined) {
        rows.push({
            key: window.kind === 'weekly' ? 'weekly' : window.kind === 'primary' ? 'daily' : 'cycle',
            kind: window.kind,
            ...(window.windowMinutes !== undefined ? { windowMinutes: window.windowMinutes } : {}),
            usedPercent,
            remainingPercent,
            used: amounts?.used,
            total: amounts?.total,
            remaining: amounts?.remaining,
            ...(amounts?.usd === true ? { unit: 'usd' } : {}),
            resetAt,
            periodType,
            periodStart: typeof period.start === 'string' ? period.start : config.billingPeriodStart,
            periodEnd: typeof period.end === 'string' ? period.end : config.billingPeriodEnd,
        });
    }
    if (monthly && amounts !== monthly) {
        rows.push({
            key: 'cycle:monthly',
            kind: 'cycle',
            product: 'monthly',
            used: monthly.used,
            total: monthly.total,
            remaining: monthly.remaining,
            ...(monthly.usd === true ? { unit: 'usd' } : {}),
            resetAt,
        });
    }
    if (onDemand && amounts !== onDemand) {
        const onDemandUsed = onDemand.total > 0 ? clampPct(((onDemand.used ?? 0) / onDemand.total) * 100) : undefined;
        rows.push({
            key: 'product:on-demand',
            kind: 'product',
            product: 'on-demand',
            usedPercent: onDemandUsed,
            remainingPercent: onDemandUsed === undefined ? undefined : 100 - onDemandUsed,
            used: onDemand.used,
            total: onDemand.total,
            remaining: onDemand.remaining,
            ...(onDemand.usd === true ? { unit: 'usd' } : {}),
            resetAt,
        });
    }
    const prepaid = grokMoneyAmount(config.prepaidBalance
        ?? config.prepaid_balance
        ?? billing.prepaidBalance
        ?? billing.prepaid_balance);
    if (prepaid !== undefined && prepaid.amount > 0) {
        rows.push({ key: 'prepaid', kind: 'prepaid', remaining: prepaid.amount, ...(prepaid.usd ? { unit: 'usd' } : {}) });
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
        periodStart: current?.periodStart ?? snapshot.periodStart,
        periodEnd: current?.periodEnd,
        used: current?.used,
        total: current?.total,
        remaining: current?.remaining,
        ...(current?.unit !== undefined ? { unit: current.unit } : {}),
    };
    if (idx >= 0)
        rows[idx] = { ...current, ...next };
    else
        rows.unshift(next);
    return { ...base, rows };
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
export async function fetchGrokQuota(session, fetchFn = outboundFetch) {
    const headers = grokQuotaHeaders(session);
    const [billing, user, credits, reset] = await quotaReads(fetchFn, [
        { url: GROK_BILLING_URL, label: 'grok billing', init: { headers } },
        { url: GROK_CLI_USER_URL, label: 'grok user', init: { headers } },
        {
            label: 'grok credits',
            run: async (signal) => {
                const response = await fetchFn(GROK_CREDITS_URL, {
                    method: 'POST',
                    headers: grokCreditsHeaders(session),
                    body: GROK_WEB_EMPTY_FRAME,
                    signal,
                });
                if (!response.ok)
                    throw new Error(`grok credits failed (HTTP ${response.status})`);
                const decoded = decodeGrokCreditsFrame(Buffer.from(await response.arrayBuffer()));
                if (!decoded)
                    throw new Error('grok credits returned no usage');
                return decoded;
            },
        },
        { label: 'grok reset cards', run: () => fetchGrokResetTokens(session, fetchFn) },
    ]);
    // The CLI billing answer and the web credits frame are two readings of one
    // weekly pool (unified-billing plans omit the percent on the CLI side), so
    // only losing both is a failed read.
    if (!billing.ok && !credits.ok)
        throw billing.error;
    const parsed = applyGrokCreditsSnapshot(parseGrokBilling(billing.ok ? billing.raw : {}, { cliUser: user.ok ? user.raw : undefined }), credits.ok ? credits.raw : undefined);
    // A failed card read leaves resetCredits off so the store keeps the last bank.
    if (!reset.ok)
        return parsed;
    return { ...parsed, resetCredits: grokResetBank(reset.raw) };
}
function postGrokResetRpc(session, url, body, fetchFn) {
    return withQuotaTimeout(async (signal) => {
        const response = await fetchFn(url, {
            method: 'POST',
            headers: grokResetHeaders(session),
            body,
            signal,
        });
        if (!response.ok)
            throw new Error(`grok reset cards failed (HTTP ${response.status})`);
        return readGrokRpc(Buffer.from(await response.arrayBuffer()), response.headers?.get?.('grpc-status'), response.headers?.get?.('grpc-message'));
    });
}
/**
 * Live reset tokens (with their secret ids — host-only). Throws on any
 * transport / gRPC failure so a caller never reads a failure as "no cards";
 * an empty DATA frame + grpc-status 0 is a real zero.
 */
export async function fetchGrokResetTokens(session, fetchFn = outboundFetch) {
    const rpc = await postGrokResetRpc(session, GROK_RESET_LIST_URL, grokRpcFrame(), fetchFn);
    if (rpc.grpcStatus !== '0') {
        throw new Error(`grok reset cards failed: ${trimmedQuotaMsg(rpc.grpcMessage) ?? `grpc-status ${rpc.grpcStatus ?? 'missing'}`}`);
    }
    const tokens = decodeGrokResetTokens(rpc.payload);
    if (!tokens)
        throw new Error('grok reset cards returned a malformed list');
    return tokens;
}
/**
 * Redeem one token. The token id is the idempotency key: a retry after a lost
 * answer comes back `alreadyRedeemed`, which counts as done. `noCredit`
 * throws `GrokResetRejected` (nothing was spent).
 */
export class GrokResetRejected extends Error {
}
export async function consumeGrokResetToken(session, tokenId, fetchFn = outboundFetch) {
    const rpc = await postGrokResetRpc(session, GROK_RESET_REDEEM_URL, grokRedeemResetFrame(tokenId), fetchFn);
    const outcome = grokRedeemOutcome(rpc.grpcStatus, rpc.grpcMessage);
    if (outcome === 'reset' || outcome === 'alreadyRedeemed')
        return { ok: true, outcome };
    const detail = trimmedQuotaMsg(rpc.grpcMessage) ?? `grpc-status ${rpc.grpcStatus ?? 'missing'}`;
    if (outcome === 'noCredit')
        throw new GrokResetRejected(`grok reset card failed: ${detail}`);
    throw new Error(`grok reset card failed: ${detail}`);
}
/**
 * Spend the card the panel named by its public id — the family's reset hook
 * (families.ts), driven by QuotaStore.consume. The public id is a hash
 * (reset-frame.ts), so the token is resolved by a fresh list read: a card
 * spent or expired since the panel rendered is refused instead of silently
 * spending another.
 */
export async function spendGrokResetCard(session, creditId, { fetchFn }) {
    const tokens = await fetchGrokResetTokens(session, fetchFn);
    const token = tokens.find((row) => grokResetCardId(row.tokenId) === String(creditId ?? ''));
    if (!token)
        throw new Error('Grok reset card is not available — refresh quota and retry');
    await consumeGrokResetToken(session, token.tokenId, fetchFn);
}
