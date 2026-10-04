/**
 * OAuth token-endpoint error vocabulary. A leaf module (no imports) so family
 * modules can share it without value-importing tokens.js, which owns refresh
 * coalescing and imports the store.
 */
export declare class OAuthEndpointError extends Error {
    status: any;
    oauthCode: any;
    constructor(message: any, status?: any, oauthCode?: any);
}
/** The OAuth error code in a token-endpoint body: `error` / `error_code`, or `error.code`. */
export declare function oauthCodeOf(body: any): string | undefined;
export declare function oauthError(response: any, label: any): Promise<OAuthEndpointError>;
/**
 * The only test for "this login is gone": a structured 401 `status` or an
 * OAuth grant code — the shared ones plus the family's `extraCodes`. 403 /
 * 429 / 5xx and digits in message text are transient: deleting a login on
 * them logs the user out over a blip.
 */
export declare function isPermanentRefreshFailure(error: any, extraCodes?: readonly string[]): boolean;
