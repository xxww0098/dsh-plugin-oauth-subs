/**
 * Quota store: the per-account cache (mirrored to quota-snapshot.json), the
 * stale-while-revalidate read, reset-card spending, and the family dispatch
 * (a registry lookup into `families.ts`).
 * Each family's endpoints and parsing live in its own `quota.ts`
 * (`src/oauth/<id>/quota.ts`, `src/apikey/<id>/quota.ts`); shared coercion
 * and fetch helpers are in `quota-shared.ts`.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { grokResetCardId } from './grok/reset-frame.js';
import { formatPlanLabel } from './plan.js';
import { accountIdOf } from './store.js';
import { writePrivateText } from '../utils/private-text.js';
import { outboundFetch } from '../utils/outbound.js';
import { consumeCodexReset, parseCodexRateLimitsFrame } from './codex/quota.js';
import { consumeGlmResetCard, GlmResetRejected } from './glm/quota.js';
import { consumeGrokResetToken, fetchGrokQuota, fetchGrokResetTokens } from './grok/quota.js';
import { oauthFamily } from './families.js';
import { isAvailableResetCredit } from './quota-shared.js';
export const QUOTA_TTL_MS = 60_000;
/**
 * Freshness window once a proxied chat request has spent this account's quota
 * (`QuotaStore.touch`). A floor, not a trigger: an agent loop firing dozens of
 * requests a minute still costs at most one quota read per account per 15s,
 * and only while the panel polls `snapshot()`.
 */
export const QUOTA_USED_TTL_MS = 15_000;
function publicResetCredits(value) {
    if (!value)
        return { availableCount: 0, credits: [] };
    const available = (value.credits ?? []).filter(isAvailableResetCredit).map((credit) => ({
        id: credit.id,
        expiresAt: credit.expiresAt,
        ...(credit.resetType ? { resetType: credit.resetType } : {}),
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
const SNAPSHOT_VERSION = 1;
/** Past this a saved reading is history, not a stand-in: quota windows have reset. */
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT_DEBOUNCE_MS = 2_000;
/**
 * The quota cache, mirrored to a private file so a restart or hot reload shows
 * the last known numbers at once. A restored entry is old, so `ensure` serves it
 * and re-reads behind it — nothing else in the store knows the file exists.
 * Every write path goes through set / delete / clear, which is where it hooks.
 */
class PersistedCache extends Map {
    #path;
    #timer;
    #chain = Promise.resolve();
    #written = '';
    constructor(path) {
        super();
        this.#path = path;
        try {
            const saved = JSON.parse(readFileSync(path, 'utf8'));
            if (saved?.version === SNAPSHOT_VERSION && saved.entries && typeof saved.entries === 'object') {
                for (const [key, entry] of Object.entries(saved.entries)) {
                    if (Array.isArray(entry?.rows) && entry.rows.length && Date.now() - entry.updatedAt < SNAPSHOT_MAX_AGE_MS)
                        super.set(key, entry);
                }
                this.#written = this.#serialize();
            }
        }
        catch { /* first run, or a file we cannot read: start empty */ }
    }
    set(key, value) {
        super.set(key, value);
        this.#schedule();
        return this;
    }
    delete(key) {
        const had = super.delete(key);
        if (had)
            this.#schedule();
        return had;
    }
    clear() {
        if (!this.size)
            return;
        super.clear();
        this.#schedule();
    }
    /** Write now (a reload is about to drop the timer) and wait for it. */
    flush() {
        clearTimeout(this.#timer);
        this.#timer = undefined;
        // Serialized at write time, so a later write can never put older data back.
        this.#chain = this.#chain.then(async () => {
            const text = this.#serialize();
            if (text === this.#written)
                return;
            await writePrivateText(this.#path, text);
            this.#written = text;
        }).catch(() => undefined);
        return this.#chain;
    }
    #schedule() {
        if (this.#timer)
            return;
        this.#timer = setTimeout(() => { void this.flush(); }, SNAPSHOT_DEBOUNCE_MS);
        this.#timer.unref?.();
    }
    /** Only readings that carry numbers; an error entry keeps the rows it had, and comes back as `ready`. */
    #serialize() {
        const entries = {};
        for (const [key, entry] of this) {
            if (!Array.isArray(entry?.rows) || !entry.rows.length)
                continue;
            const { usedAt, error, ...kept } = entry;
            entries[key] = { ...kept, status: 'ready' };
        }
        return JSON.stringify({ version: SNAPSHOT_VERSION, entries });
    }
}
export class QuotaStore {
    constructor({ tokens, fetchFn = outboundFetch, ttlMs = QUOTA_TTL_MS, snapshotPath = undefined } = {}) {
        this.tokens = tokens;
        this.fetchFn = fetchFn;
        this.ttlMs = ttlMs;
        this.cache = snapshotPath ? new PersistedCache(snapshotPath) : new Map();
        this.inflight = new Map();
        this.glmResetRequests = new Map();
    }
    /** Persist the cache now, when it is persisted at all. */
    async flush() {
        await this.cache.flush?.();
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
    /** Record a known failure without calling upstream (e.g. a stale imported login). */
    fail(provider, accountId, message) {
        const key = quotaCacheKey(provider, accountId);
        const previous = this.cache.get(key);
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
    /**
     * `maxAgeMs` tightens the freshness window for one call — the panel sends it
     * when the user (re)enters the quota page, so a reading older than the 15s
     * floor is re-read behind the cached answer instead of waiting out the TTL.
     */
    async ensure(provider, accountId, session, maxAgeMs = this.ttlMs) {
        const live = session ?? await this.#activeSession(provider);
        const id = accountId ?? (live ? accountIdOf(provider, live) : undefined);
        const key = quotaCacheKey(provider, id);
        const cached = this.cache.get(key);
        const ttl = cached?.usedAt !== undefined ? Math.min(maxAgeMs, QUOTA_USED_TTL_MS) : maxAgeMs;
        if (cached && Date.now() - cached.updatedAt < ttl) {
            return publicQuota(cached, provider);
        }
        // Stale-while-revalidate for errors too: the snapshot awaits families in
        // series, so a blocking re-read of a down upstream stalls the whole panel.
        if (cached && (cached.status === 'ready' || cached.status === 'error')) {
            void this.refresh(provider, id, live);
            return publicQuota(cached, provider);
        }
        return this.refresh(provider, id, live);
    }
    /**
     * A proxied chat request for this account finished: its quota moved. Only
     * shortens the cached entry's freshness window — no upstream call here.
     */
    async touch(provider, session) {
        const live = session ?? await this.#activeSession(provider);
        const id = live ? accountIdOf(provider, live) : undefined;
        const entry = this.cache.get(quotaCacheKey(provider, id));
        if (entry)
            entry.usedAt = Date.now();
    }
    /**
     * Passive quota learning: the response itself carried this account's quota
     * (today only the Codex Responses stream's `codex.rate_limits` frame), so the
     * rows are updated without a side-read. The endpoint read stays authoritative
     * — a refresh that was in flight overwrites what this wrote, and `usedAt` is
     * left alone (`touch` marks the spend the moment the response closes).
     */
    async learn(provider, data, session) {
        if (provider !== 'codex')
            return undefined;
        const parsed = parseCodexRateLimitsFrame(data);
        if (!parsed.rows.length)
            return undefined;
        const live = session ?? await this.#activeSession(provider);
        const id = live ? accountIdOf(provider, live) : undefined;
        const key = quotaCacheKey(provider, id);
        const previous = this.cache.get(key);
        const entry = {
            status: 'ready',
            planType: parsed.planType ?? previous?.planType,
            account: previous?.account,
            subscriptionStatus: previous?.subscriptionStatus,
            hasGrokCodeAccess: previous?.hasGrokCodeAccess,
            updatedAt: Date.now(),
            // A frame without a credits block must not drop the last known balance
            // (older servers / account shapes that don't send it on the wire).
            rows: parsed.rows.some((row) => row.kind === 'prepaid')
                ? parsed.rows
                : [...parsed.rows, ...(previous?.rows ?? []).filter((row) => row.kind === 'prepaid')],
            // The frame says nothing about the reset-credit bank: keep the last one.
            resetCredits: previous?.resetCredits ?? { availableCount: 0 },
        };
        this.cache.set(key, entry);
        return publicQuota(entry, provider);
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
    async consume(provider, accountId, session, creditId) {
        if (provider === 'glm')
            return this.#consumeGlm(accountId, session, creditId);
        if (provider === 'grok')
            return this.#consumeGrok(accountId, session, creditId);
        if (provider !== 'codex')
            throw new Error('only ChatGPT Codex, Grok and GLM can reset quota');
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
    /**
     * One GLM reset card. The card must be in the cached bank (the UI only
     * offers listed cards). `requestId` is kept per card until the vendor
     * answers, so a retry after a lost response cannot spend a second card;
     * in-memory only — a restart mints a fresh one.
     */
    async #consumeGlm(accountId, session, creditId) {
        const live = session ?? await this.#activeSession('glm');
        if (!live)
            throw new Error('GLM is not signed in');
        const id = accountId ?? accountIdOf('glm', live);
        const key = quotaCacheKey('glm', id);
        const pending = this.inflight.get(key);
        if (pending)
            await pending.catch(() => undefined);
        const bank = this.cache.get(key)?.resetCredits;
        const credit = (bank?.credits ?? []).find((row) => row.id === String(creditId ?? '') && isAvailableResetCredit(row));
        if (!credit || !credit.resetType)
            throw new Error('GLM reset card is not available — refresh quota and retry');
        const retryKey = `${key}\0${credit.id}`;
        const requestId = this.glmResetRequests.get(retryKey) ?? randomUUID();
        this.glmResetRequests.set(retryKey, requestId);
        try {
            await consumeGlmResetCard(live, credit, requestId, this.fetchFn);
            this.glmResetRequests.delete(retryKey);
        }
        catch (error) {
            if (error instanceof GlmResetRejected)
                this.glmResetRequests.delete(retryKey);
            throw error;
        }
        this.cache.delete(key);
        return this.refresh('glm', id, live);
    }
    /**
     * One Grok reset card. The public id is a hash, so the token is resolved by
     * a fresh list read — a card spent or expired since the panel rendered is
     * refused instead of silently spending another.
     */
    async #consumeGrok(accountId, session, creditId) {
        const live = session ?? await this.#activeSession('grok');
        if (!live)
            throw new Error('Grok is not signed in');
        const id = accountId ?? accountIdOf('grok', live);
        const key = quotaCacheKey('grok', id);
        const pending = this.inflight.get(key);
        if (pending)
            await pending.catch(() => undefined);
        const tokens = await fetchGrokResetTokens(live, this.fetchFn);
        const token = tokens.find((row) => grokResetCardId(row.tokenId) === String(creditId ?? ''));
        if (!token)
            throw new Error('Grok reset card is not available — refresh quota and retry');
        await consumeGrokResetToken(live, token.tokenId, this.fetchFn);
        this.cache.delete(key);
        return this.refresh('grok', id, live);
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
        const startedAt = Date.now();
        // A touch() that lands while this read is in flight is not reflected in it.
        const usedSince = () => {
            const usedAt = this.cache.get(key)?.usedAt;
            return usedAt !== undefined && usedAt >= startedAt ? usedAt : undefined;
        };
        this.cache.set(key, {
            ...(previous ?? {}),
            status: previous?.status === 'ready' ? 'ready' : 'loading',
            updatedAt: previous?.updatedAt ?? Date.now(),
            rows: previous?.rows ?? [],
            resetCredits: previous?.resetCredits ?? { availableCount: 0 },
        });
        try {
            // Registry dispatch; a provider with no row keeps the historical grok
            // fetcher, exactly the old ternary chain's final fallback branch.
            const parsed = await (oauthFamily(provider)?.fetchQuota ?? fetchGrokQuota)(session, this.fetchFn);
            const entry = {
                status: 'ready',
                planType: parsed.planType,
                account: parsed.account,
                subscriptionStatus: parsed.subscriptionStatus,
                hasGrokCodeAccess: parsed.hasGrokCodeAccess,
                updatedAt: Date.now(),
                usedAt: usedSince(),
                rows: parsed.rows ?? [],
                // A family whose side-read failed leaves resetCredits off: keep the last bank.
                resetCredits: parsed.resetCredits ?? previous?.resetCredits ?? { availableCount: 0 },
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
                usedAt: usedSince(),
                error: message,
                rows: previous?.rows ?? [],
                resetCredits: previous?.resetCredits ?? { availableCount: 0 },
            };
            this.cache.set(key, entry);
            return publicQuota(entry, provider);
        }
    }
}
