/**
 * Import existing Codex CLI / Grok CLI / Hermes OAuth sessions so a user who
 * has already logged in on this machine does not have to repeat the browser
 * flow.
 *
 * Recognised files:
 *   ~/.codex/auth.json          Codex CLI
 *   ~/.grok/auth.json           Grok CLI ($GROK_HOME/auth.json)
 *   ~/.hermes/auth.json         Hermes multi-provider store
 *   ~/.zcode/v2/config.json     ZCode Desktop (Coding Plan apiKey under provider)
 *   ~/.zcode/cli/config.json    older ZCode CLI
 *   ~/.zcode/config.json        older ZCode
 *   credentials.json            kiro.rs CWD dump
 *   ~/.kiro/credentials.json    Kiro IDE
 *   ~/.aws/sso/cache/kiro-auth-token.json
 *   ~/.aws/sso/cache/*.json     IdC client registration (paired with the token)
 *   kiro-manager-lite 卡密 / compact JSON / full backup (paste or file)
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
export declare function glmKeyFromZcodeConfig(raw: any): {
    apiKey: any;
    region: any;
};
export declare function glmAuthSearchPaths(): string[];
export declare function antigravityAuthSearchPaths(): string[];
export declare function importAntigravityAuth({ paths, fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    session: {
        validationUrl?: string;
        needsValidation?: boolean;
        planType?: any;
        accessToken: any;
        refreshToken: any;
        expiresAt: number;
        account: string;
        projectId: any;
    };
    source: any;
}>;
export declare function importGlmAuth(paths?: string[]): Promise<{
    session: {
        zcodeJwt?: any;
        planType?: any;
        region: string;
        account?: string;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
    };
    source: string;
}>;
export declare function kiroAuthSearchPaths(): string[];
export declare function sessionFromKiroAuth(raw: any): any;
export declare function importKiroAuth(paths: any): Promise<{
    session: any;
    sessions: any[];
    source: any;
}>;
