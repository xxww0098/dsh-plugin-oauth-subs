/**
 * Quota store: the per-account cache (mirrored to quota-snapshot.json), the
 * stale-while-revalidate read, reset-card spending, and the family dispatch
 * (a registry lookup into `families.ts`).
 * Each family's endpoints and parsing live in its own `quota.ts`
 * (`src/oauth/<id>/quota.ts`, `src/apikey/<id>/quota.ts`); shared coercion
 * and fetch helpers are in `quota-shared.ts`.
 */
export declare const QUOTA_TTL_MS = 60000;
/**
 * Freshness window once a proxied chat request has spent this account's quota
 * (`QuotaStore.touch`). A floor, not a trigger: an agent loop firing dozens of
 * requests a minute still costs at most one quota read per account per 15s,
 * and only while the panel polls `snapshot()`.
 */
export declare const QUOTA_USED_TTL_MS = 15000;
export declare class QuotaStore {
    #private;
    tokens: any;
    fetchFn: any;
    ttlMs: number;
    cache: Map<string, any>;
    inflight: Map<string, any>;
    glmResetRequests: Map<string, string>;
    constructor({ tokens, fetchFn, ttlMs, snapshotPath }?: any);
    /** Persist the cache now, when it is persisted at all. */
    flush(): Promise<void>;
    peek(provider: any, accountId?: any): {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
    clear(provider: any, accountId?: any): void;
    /** Record a known failure without calling upstream (e.g. a stale imported login). */
    fail(provider: any, accountId: any, message: any): {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
    /**
     * `maxAgeMs` tightens the freshness window for one call — the panel sends it
     * when the user (re)enters the quota page, so a reading older than the 15s
     * floor is re-read behind the cached answer instead of waiting out the TTL.
     */
    ensure(provider: any, accountId?: any, session?: any, maxAgeMs?: number): Promise<any>;
    /**
     * A proxied chat request for this account finished: its quota moved. Only
     * shortens the cached entry's freshness window — no upstream call here.
     */
    touch(provider: any, session?: any): Promise<void>;
    /**
     * Passive quota learning: the response itself carried this account's quota
     * (today only the Codex Responses stream's `codex.rate_limits` frame), so the
     * rows are updated without a side-read. The endpoint read stays authoritative
     * — a refresh that was in flight overwrites what this wrote, and `usedAt` is
     * left alone (`touch` marks the spend the moment the response closes).
     */
    learn(provider: any, data: any, session?: any): Promise<{
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    } | undefined>;
    refresh(provider: any, accountId?: any, session?: any): Promise<any>;
    consume(provider: any, accountId?: any, session?: any, creditId?: any): Promise<any>;
}
