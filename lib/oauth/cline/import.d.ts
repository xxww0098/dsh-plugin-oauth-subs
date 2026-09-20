/**
 * Import the installed Cline CLI login.
 *
 *   ~/.cline/data/settings/providers.json   (CLINE_HOME overrides ~/.cline)
 *
 * `ProviderSettingsManager` writes one entry per provider id; the OAuth
 * session lives at `providers.<id>.settings.auth` with the `workos:`-prefixed
 * access token, the refresh token, `expiresAt`, the `usr-…` account id and
 * `metadata.userInfo`. `cline-pass` stores under the same shape and is read as
 * a fallback. Read-only: never write back to ~/.cline, never overwrite a
 * stored session (auto-import only runs while the roster is empty).
 */
export declare const CLINE_IMPORT_EMPTY = "cline-import-empty";
export declare function clineSessionFromCliSettings(settings: any): {
    tokenType: string;
    source: string;
    userId?: string | undefined;
    account?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: any;
} | undefined;
/** First `cline` / `cline-pass` entry carrying a usable OAuth session. */
export declare function clineSessionFromProvidersFile(data: any): {
    tokenType: string;
    source: string;
    userId?: string | undefined;
    account?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: any;
} | undefined;
export declare function resolveClineCliCredentials(options?: any): Promise<{
    tokenType: string;
    source: string;
    userId?: string | undefined;
    account?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: any;
} | undefined>;
export declare function importClineAuth(options?: any): Promise<{
    source: string;
    session: {
        tokenType: string;
        source: string;
        userId?: string | undefined;
        account?: string | undefined;
        accessToken: string;
        refreshToken: string;
        expiresAt: any;
    };
}>;
