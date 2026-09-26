/** One refresh owner per stored login and credential version. */
/**
 * How long a transient refresh failure suppresses another attempt for the same
 * credential version. Mirrors CLIProxyAPI's refreshFailureBackoff: without it,
 * every request during a token-endpoint outage re-hammers the endpoint.
 */
export declare const REFRESH_FAILURE_BACKOFF_MS: number;
/**
 * Longest a request waits on a refresh. The refresh itself keeps running as
 * the single owner of that credential version — a second redemption of a
 * rotating refresh token would be answered with invalid_grant.
 */
export declare const REFRESH_WAIT_MS = 30000;
export declare class TokenManager {
    #private;
    provider: string;
    authPath: string;
    displayName: string;
    preemptMs: number;
    /** Injected refresh callback; distinct from the private #refresh method. */
    refresh: any;
    isPermanent: any;
    onRemoved: any;
    refreshWaitMs: number;
    inflight: Map<any, any>;
    failures: Map<any, any>;
    sources: WeakMap<object, any>;
    constructor({ provider, authPath, displayName, preemptMs, refresh, isPermanent, onRemoved, refreshWaitMs }: any);
    session(id: any): Promise<any>;
    /** The stored-account row that produced this session, when known. */
    sourceOf(session: any): any;
    account(id: any): Promise<any>;
    /**
     * Refresh the stored login regardless of its expiry window — the proxy calls
     * this after an upstream 401 (CLIProxyAPI's tryRefreshAfterUnauthorized). A
     * concurrent refresh that already rotated the failed access token is reused
     * instead of forcing a second redemption of the same refresh token.
     */
    refreshNow(id: any, failedAccessToken: any): Promise<any>;
    remember(session: any, fields: any): Promise<void>;
}
