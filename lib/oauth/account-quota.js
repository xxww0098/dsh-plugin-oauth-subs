/**
 * Quota across stored accounts: live-session resolution (stale imported
 * logins carry their reason), per-account quota hydration with the identity
 * write-backs it triggers, the Settings refresh RPC, and reset-card spending.
 */
import { accountIdOf, getStoredSession, listStoredSessions, PROVIDER_IDS, publicSession } from './store.js';
import { ImportedLoginStale } from './tokens.js';
import { QUOTA_USED_TTL_MS } from './quota.js';
import { oauthFamily } from './families.js';
export async function liveAccounts(ctl, provider) {
    const rows = await listStoredSessions(provider, ctl.authPath);
    const live = await Promise.all(rows.map(async (row) => {
        try {
            return await ctl.tokens[provider].account(row.id);
        }
        catch (error) {
            // A transient refresh failure can still use the stored access token.
            // Permanent failures and logout remove the row instead of reviving it.
            const stored = await getStoredSession(provider, row.id, ctl.authPath);
            // An imported login whose CLI store also expired: the stored token is
            // dead too, so carry the actionable reason instead of letting the quota
            // read hit upstream and surface the vendor's 401 text.
            if (stored && error instanceof ImportedLoginStale && !(stored.session?.expiresAt > Date.now())) {
                return { ...stored, stale: error.message };
            }
            return stored;
        }
    }));
    return live.filter(Boolean);
}
export async function ensureAccountQuota(ctl, provider, revalidateQuota = false) {
    const rows = await liveAccounts(ctl, provider);
    if (rows.length === 0) {
        ctl.quota.clear(provider);
        return [];
    }
    // Post-hydration write-backs come from the family's registry row
    // (families.ts), never a per-provider branch list here.
    const afterEnsure = oauthFamily(provider)?.quota?.afterEnsure;
    await Promise.all(rows.map(async (row) => {
        if (row.stale) {
            ctl.quota.fail(provider, row.id, row.stale);
            return;
        }
        // An entry revalidation only tightens the freshness floor: readings
        // younger than QUOTA_USED_TTL_MS still serve, everything older is
        // re-read behind the cached answer (never blocking the snapshot).
        const quota = await ctl.quota.ensure(provider, row.id, row.session, revalidateQuota ? QUOTA_USED_TTL_MS : undefined);
        if (afterEnsure)
            await afterEnsure(ctl, row, quota);
    }));
    return rows;
}
export async function accountsWithQuota(ctl, provider) {
    const rows = await listStoredSessions(provider, ctl.authPath);
    return rows
        .map((row) => ({
        id: row.id,
        active: row.active,
        ...publicSession(provider, row.session),
        quota: ctl.quota.peek(provider, row.id),
    }))
        .sort((left, right) => Number(right.active) - Number(left.active) || left.id.localeCompare(right.id));
}
export async function refreshQuota(ctl, provider, accountId) {
    if (provider === 'opencode-go')
        return ctl.refreshOpencodeGoQuota(accountId);
    if (PROVIDER_IDS.includes(provider)) {
        const rows = await liveAccounts(ctl, provider);
        const targets = accountId
            ? rows.filter((row) => row.id === accountId)
            : rows;
        if (accountId && targets.length === 0)
            throw new Error(`${provider} account ${accountId} is not signed in`);
        if (targets.length === 0)
            return ctl.quota.peek(provider);
        await Promise.all(targets.map((row) => row.stale
            ? ctl.quota.fail(provider, row.id, row.stale)
            : ctl.quota.refresh(provider, row.id, row.session)));
        // Per-family refresh extras dispatch through the family registry
        // (families.ts). Order within a family is preserved from the old
        // branch chain: remember, then probe, then catalog discovery.
        const hooks = oauthFamily(provider)?.quota;
        const remember = hooks?.remember;
        if (remember) {
            await Promise.all(targets.map((row) => remember(ctl, row, ctl.quota.peek(provider, row.id))));
        }
        const probe = hooks?.probe;
        if (probe) {
            await Promise.all(targets.map((row) => probe(ctl, row)));
        }
        const discover = hooks?.discover;
        if (discover) {
            const ids = () => discover.models().map((model) => model.id).join('\0');
            const before = ids();
            discover.reset?.();
            await Promise.all(targets.map((row) => discover.run(ctl, row.session)));
            if (ctl.settings && ids() !== before) {
                await ctl.sync().catch(() => undefined);
            }
        }
        const latest = hooks?.relistAccountsAfterRefresh ? await liveAccounts(ctl, provider) : rows;
        if (accountId) {
            const hit = latest.find((row) => row.id === accountId) ?? latest.find((row) => row.active);
            return ctl.quota.peek(provider, hit?.id ?? accountId);
        }
        const active = latest.find((row) => row.active);
        return ctl.quota.peek(provider, active?.id);
    }
    const all = await Promise.all(PROVIDER_IDS.map((family) => ctl.refreshQuota(family)));
    return Object.fromEntries(PROVIDER_IDS.map((family, index) => [family, all[index]]));
}
export async function consumeReset(ctl, provider, accountId, creditId) {
    if (provider === 'glm') {
        const live = await ctl.tokens.glm.session(accountId);
        return ctl.quota.consume('glm', accountIdOf('glm', live), live, creditId);
    }
    if (provider === 'grok') {
        const live = await ctl.tokens.grok.session(accountId);
        return ctl.quota.consume('grok', accountIdOf('grok', live), live, creditId);
    }
    if (provider !== 'codex')
        throw new Error('only ChatGPT Codex, Grok and GLM can reset quota');
    const live = await ctl.tokens.codex.session(accountId);
    return ctl.quota.consume('codex', accountIdOf('codex', live), live);
}
