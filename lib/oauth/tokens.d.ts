/** One refresh owner per stored login and credential version. */
import { RequestError } from '../utils/http.js';
/** OAuth token-endpoint error vocabulary, re-exported from the shared leaf. */
export { OAuthEndpointError, oauthCodeOf, oauthError, isPermanentRefreshFailure } from './errors.js';
/**
 * The login is missing or gone and only the user can fix it. 403, so the host
 * classifies it AUTH and does not retry; the proxy answers by `status` alone.
 */
export declare class LoginRequiredError extends RequestError {
    constructor(message: string);
}
/**
 * A login imported from a vendor CLI whose own store has also expired. The
 * plugin never redeems the CLI's refresh token (where it rotates, that logs
 * the CLI out), so only the user can fix it — by running that CLI. Not permanent: the
 * login stays and the next reread picks up whatever the CLI wrote.
 */
export declare class ImportedLoginStale extends LoginRequiredError {
    constructor(displayName: string, cli: string, why?: string);
}
/**
 * How long a transient refresh failure suppresses another attempt for the same
 * credential version. Mirrors CLIProxyAPI's refreshFailureBackoff: without it,
 * every request during a token-endpoint outage re-hammers the endpoint.
 */
export declare const REFRESH_FAILURE_BACKOFF_MS: number;
/**
 * An expired token cannot fall back to serving, so its backoff is short: the
 * last failure is replayed for this long instead of re-hitting the endpoint on
 * every request, then the next request tries again.
 */
export declare const REFRESH_EXPIRED_RETRY_MS = 10000;
/**
 * How long an unsettled exchange stays the single owner of its credential
 * version. A second redemption of a rotating refresh token races the first
 * (invalid_grant) — only an exchange hung past this cap is given up on.
 */
export declare const REFRESH_LATE_CAP_MS = 120000;
/**
 * Longest a request waits on a refresh. The refresh itself keeps running as
 * the single owner of that credential version — a second redemption of a
 * rotating refresh token would be answered with invalid_grant.
 */
export declare const REFRESH_WAIT_MS = 30000;
/**
 * How long one attempt waits on a refresh exchange (pi-ai bounds the same
 * exchange at 15s). Family refresh calls carry no AbortSignal: a token endpoint
 * that accepts the connection and stalls would otherwise make every request
 * for that account pay the full waiter timeout instead of failing over to a
 * still-valid token. The exchange itself keeps running (REFRESH_LATE_CAP_MS).
 */
export declare const REFRESH_EXCHANGE_TIMEOUT_MS = 20000;
export declare class TokenManager {
    #private;
    provider: string;
    authPath: string;
    displayName: string;
    preemptMs: number;
    /** Injected refresh callback; distinct from the private #refresh method. */
    refresh: any;
    /** Family grant codes that are permanent beyond the shared ones. */
    permanentCodes: readonly string[];
    onRemoved: any;
    /**
     * `{ is(session), reread(session), cli, identity?(session) }` — logins owned
     * by a vendor CLI's store; `identity` names the account where the store has one.
     */
    imported: any;
    /** version → when its imported store was last reread (throttles rereads that find nothing newer). */
    rereadAt: Map<any, number>;
    refreshWaitMs: number;
    exchangeTimeoutMs: number;
    /** version → the exchange that owns it: { at, late, promise }. */
    inflight: Map<any, any>;
    failures: Map<any, any>;
    sources: WeakMap<object, any>;
    constructor({ provider, authPath, displayName, preemptMs, refresh, permanentCodes, onRemoved, imported, refreshWaitMs, exchangeTimeoutMs }: any);
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
/**
 * `run`'s `refresh` hook: after an upstream 401, force-refresh the stored login
 * behind `get()` once and hand the rotated session to `set`. False when there
 * is none or the refresh fails — `run` then forwards the upstream's own 401.
 */
export declare function forcedRefresh(tokens: any, get: () => any, set: (session: any) => void): () => Promise<boolean>;
