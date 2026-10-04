/**
 * Grok CLI / Hermes local-session import: a user who has already logged in
 * on this machine does not have to repeat the browser flow.
 *
 * Recognised files:
 *   ~/.grok/auth.json           Grok CLI ($GROK_HOME/auth.json)
 *   ~/.hermes/auth.json         Hermes multi-provider store
 */
export declare const GROK_HERMES_KEYS: readonly string[];
export declare function grokAuthSearchPaths(): string[];
export declare function tokensFromGrokCli(raw: any): any;
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
