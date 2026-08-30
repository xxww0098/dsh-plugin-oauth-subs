/**
 * Auth controller behind the Settings page RPC.
 * Codex PKCE (+ paste callback + import), Grok device-code (primary) + PKCE fallback.
 */
export declare class AuthController {
    constructor({ authPath, prefix, origin, settings, grokLogin, onAuthChanged, models, fetchFn, quotaTtlMs }: {
        authPath: any;
        prefix: any;
        origin: any;
        settings: any;
        grokLogin?: string;
        onAuthChanged: any;
        models: any;
        fetchFn?: typeof fetch;
        quotaTtlMs: any;
    });
    claim(provider: any): any;
    loggedIn(): Promise<{
        codex: boolean;
        grok: boolean;
    }>;
    status(provider: any): Promise<{
        detail?: any;
        quota: any;
        account: any;
        planType: any;
        planLabel: any;
        expiresAt: any;
        scopes?: undefined;
        loggedIn: boolean;
        busy: any;
    } | {
        detail?: any;
        quota: any;
        account: any;
        planType: any;
        planLabel: any;
        scopes: any;
        expiresAt: any;
        loggedIn: boolean;
        busy: any;
    }>;
    catalog(): {};
    snapshot(): Promise<{
        origin: any;
        grokLogin: any;
        catalog: {
            provider: string;
            displayName: any;
            family: string;
            loggedIn: boolean;
            models: any;
        }[];
        providers: {
            provider: string;
            api: any;
            models: any;
        }[];
        selected: any;
        accounts: {
            codex: {
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                scopes: any;
                expiresAt: any;
                loggedIn: boolean;
                busy: any;
            };
            grok: {
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                scopes: any;
                expiresAt: any;
                loggedIn: boolean;
                busy: any;
            };
        };
    }>;
    refreshQuota(provider: any): Promise<any>;
    consumeReset(provider: any): Promise<any>;
    login(provider: any, mode: any): Promise<{
        authorizeUrl: any;
        redirectUri: any;
        mode: string;
        verificationUri?: undefined;
        userCode?: undefined;
    } | {
        authorizeUrl: any;
        verificationUri: any;
        userCode: any;
        mode: string;
        redirectUri?: undefined;
    }>;
    completePkce(provider: any, attempt: any, claim: any): Promise<void>;
    completeDevice(provider: any, attempt: any): Promise<void>;
    manual(provider: any, input: any): Promise<void>;
    cancel(provider: any): Promise<void>;
    logout(provider: any): Promise<void>;
    importFrom(provider: any): Promise<{
        source: string;
        account: {
            account: any;
            planType: any;
            planLabel: any;
            expiresAt: any;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            scopes: any;
            expiresAt: any;
        };
    }>;
    setModels(payload?: {}): Promise<{
        origin: any;
        grokLogin: any;
        catalog: {
            provider: string;
            displayName: any;
            family: string;
            loggedIn: boolean;
            models: any;
        }[];
        providers: {
            provider: string;
            api: any;
            models: any;
        }[];
        selected: any;
        accounts: {
            codex: {
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                scopes: any;
                expiresAt: any;
                loggedIn: boolean;
                busy: any;
            };
            grok: {
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                scopes: any;
                expiresAt: any;
                loggedIn: boolean;
                busy: any;
            };
        };
    }>;
    sync(selected: any): Promise<{
        routes: {
            provider: string;
            api: any;
            models: any;
        }[];
    }>;
}
