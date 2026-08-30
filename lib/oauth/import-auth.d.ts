/**
 * Import existing Codex CLI / Grok CLI / Hermes OAuth sessions so a user who
 * has already logged in on this machine does not have to repeat the browser
 * flow.
 *
 * Recognised files:
 *   ~/.codex/auth.json          Codex CLI
 *   ~/.grok/auth.json           Grok CLI ($GROK_HOME/auth.json)
 *   ~/.hermes/auth.json         Hermes multi-provider store
 */
export declare const GROK_HERMES_KEYS: readonly string[];
export declare function grokAuthSearchPaths(): string[];
export declare function tokensFromHermes(raw: any, keys: any): {
    access_token: string;
    refresh_token: string;
    id_token: string;
    expires_in: any;
    expires_at: any;
    last_refresh: string;
    token_endpoint: string;
    account: string;
};
export declare function tokensFromGrokCli(raw: any): any;
export declare function importCodexAuth(): Promise<{
    session: {
        planType?: any;
        emailAddress?: any;
        idToken?: any;
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        accountId: any;
    };
    source: string;
}>;
export declare function importGrokAuth(paths?: string[]): Promise<{
    session: {
        clientId?: any;
        planType?: any;
        account?: any;
        scopes?: any;
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        tokenEndpoint: any;
    };
    source: string;
}>;
