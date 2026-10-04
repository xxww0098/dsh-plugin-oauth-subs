/**
 * OAuth token-endpoint error vocabulary. A leaf module (no imports) so family
 * modules can share it without value-importing tokens.js, which owns refresh
 * coalescing and imports the store.
 */
export declare class OAuthEndpointError extends Error {
    status: number | undefined;
    oauthCode: string | undefined;
    constructor(message: string, status?: number, oauthCode?: string);
}
/** The OAuth error code in a token-endpoint body: `error` / `error_code`, or `error.code`. */
export declare function oauthCodeOf(body: string): string | undefined;
export declare function oauthError(response: {
    status: number;
    text(): Promise<string>;
}, label: string): Promise<OAuthEndpointError>;
/**
 * The only test for "this login is gone": a structured 401 `status` or an
 * OAuth grant code — the shared ones plus the family's `extraCodes`. 403 /
 * 429 / 5xx and digits in message text are transient: deleting a login on
 * them logs the user out over a blip.
 */
export declare function isPermanentRefreshFailure(error: unknown, extraCodes?: readonly string[]): boolean;
