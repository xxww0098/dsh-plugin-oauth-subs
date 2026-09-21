/**
 * Import existing Codex CLI / Grok CLI / Hermes OAuth sessions so a user who
 * has already logged in on this machine does not have to repeat the browser
 * flow.
 *
 * Recognised files:
 *   ~/.codex/auth.json          Codex CLI
 *   ~/.grok/auth.json           Grok CLI ($GROK_HOME/auth.json)
 *   ~/.hermes/auth.json         Hermes multi-provider store
 *   ~/.zcode/v2/credentials.json  ZCode Desktop credential store (enc:v1)
 *   ~/.zcode/v2/config.json     ZCode Desktop (Coding Plan apiKey under provider)
 *   ~/.zcode/cli/credentials.json / cli/config.json / ~/.zcode/config.json  older ZCode
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
    refresh_token: string | undefined;
    id_token: string | undefined;
    expires_in: any;
    expires_at: any;
    last_refresh: string | undefined;
    token_endpoint: string | undefined;
    account: string | undefined;
} | undefined;
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
/** Why ZCode itself refuses this provider entry, for the import error hint. */
export declare function glmZcodeDisabledReason(value: any): string | undefined;
/**
 * Best key in one ZCode provider config, usable or not. `~/.zcode/v2/config.json`
 * keeps coding-plan keys under `provider["builtin:<site>-coding-plan"].options.apiKey`;
 * recent ZCode versions disable that entry with `systemDisabledReason` when the
 * plan check fails (`coding_plan_not_entitled`, or a flaky platform reporting
 * `coding_plan_system_busy`). Import must not silently drop the key — the
 * caller decides, and can name the reason when it refuses.
 */
export declare function glmKeyCandidateFromZcodeConfig(raw: any): any;
/**
 * Best coding-plan key in a ZCode config, usable or not. ZCode's
 * `systemDisabledReason` comes from a cached entitlement check that goes stale
 * and is sometimes wrong (`coding_plan_system_busy` while the platform is
 * flaky); the key is the same credential ZCode's own provider entry holds.
 * Refusing it left users with no local import at all, so the key is returned
 * with its reason and the caller imports it — chat/quota surface the truth.
 */
export declare function glmKeyFromZcodeConfig(raw: any): {
    apiKey: any;
    region: any;
    usable: any;
    reason: any;
} | undefined;
export declare function decodeZcodeCredentialValue(value: any, { env }?: {
    env?: NodeJS.ProcessEnv | undefined;
}): any;
/**
 * Coding Plan credential from ZCode's credential store
 * (`~/.zcode/v2/credentials.json`). The chat + monitor bearer is the
 * **provisioned** `account-provider:…:api-key` — the key ZCode provisions into
 * the provider entry after OAuth. The `oauth:<region>:access_token` business
 * JWT answers monitor/quota but is not the chat key (it 500s on the Coding
 * Plan hop), so it rides along as `oauthAccess` for userinfo/identity only.
 * The plaintext `options.apiKey` in config.json can be a stale key the vendor
 * answers 「当前用户不存在coding plan」 for. `zcodejwttoken` is identity only.
 */
export declare function glmKeyFromZcodeCredentials(raw: any, { env }?: {
    env?: NodeJS.ProcessEnv | undefined;
}): {
    zcodeJwt: string;
    oauthAccess?: string | undefined;
    apiKey: any;
    region: any;
} | {
    zcodeJwt?: undefined;
    oauthAccess?: string | undefined;
    apiKey: any;
    region: any;
} | undefined;
export declare function glmAuthSearchPaths(): string[];
export declare function antigravityAuthSearchPaths(): string[];
export declare function importAntigravityAuth({ paths, fetchFn }?: any): Promise<{
    session: {
        validationUrl?: string | undefined;
        needsValidation?: boolean | undefined;
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
    note?: string | undefined;
    session: {
        oauthAccess?: string | undefined;
        zcodeJwt?: any;
        region: string;
        account?: string | undefined;
        displayName?: string | undefined;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
    };
    source: string;
}>;
export declare function kiroAuthSearchPaths(): string[];
export declare function sessionFromKiroAuth(raw: any): any;
export declare function importKiroAuth(paths?: any): Promise<{
    session: any;
    sessions: any[];
    source: any;
}>;
