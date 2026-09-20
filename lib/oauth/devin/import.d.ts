/**
 * Import the Devin CLI's `credentials.toml`. The CLI writes a tiny flat TOML
 * document — four top-level `key = "value"` lines — so a quoted-string scan
 * is the whole parser; no TOML dependency for one shape.
 *
 *   windsurf_api_key  = "devin-session-token$…"   ← the session credential
 *   api_server_url    = "https://server.codeium.com"
 *   devin_webapp_host = "https://app.devin.ai"
 *   devin_api_url     = "https://api.devin.ai"
 *
 * Locations (XDG data dir / macOS / Windows):
 *   ~/.local/share/devin/credentials.toml
 *   %LOCALAPPDATA%/devin/credentials.toml
 */
export declare const DEVIN_IMPORT_EMPTY = "devin-import-empty";
export declare function devinCredentialsPaths(): any[];
/** Flat `key = "value"` scan — the CLI only writes quoted top-level keys. */
export declare function parseDevinCredentialsToml(text: any): {
    apiKey: string;
    apiServer: any;
    webappHost: any;
    apiUrl: any;
} | undefined;
export declare function isDevinCredentialsToml(text: any): boolean;
/**
 * Read the first credentials.toml that parses. Returns
 * `{ session, source:'cli_toml', path }` — the token never leaves the session.
 * Throws DEVIN_IMPORT_EMPTY when no path yields a credential.
 */
export declare function importDevinAuth({ paths }?: {
    paths?: any[] | undefined;
}): Promise<{
    source: string;
    session: {
        source: any;
        apiServer?: string | undefined;
        planType?: string | undefined;
        account?: string | undefined;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
    };
    path: any;
}>;
