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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
        update: {
            version: string;
            platform: string;
            repo: string;
            repoSlug: string;
        };
    }>;
    refreshQuota(provider: any): Promise<any>;
    checkUpdate(): Promise<{
        version: string;
        status: string;
        latest: {
            tag: string;
            name: any;
            url: any;
            publishedAt: any;
        };
        assets: {
            platform: string;
            current: boolean;
            name: any;
            url: any;
            size: any;
            generic: boolean;
        }[];
        platform: string;
        repo: string;
        repoSlug: string;
    } | {
        status: string;
        error: string;
        latest: any;
        assets: any[];
        version: string;
        platform: string;
        repo: string;
        repoSlug: string;
    }>;
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
    logout(provider: any, id: any): Promise<void>;
    switchAccount(provider: any, id: any): Promise<{
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
        update: {
            version: string;
            platform: string;
            repo: string;
            repoSlug: string;
        };
    }>;
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
                activeId: string;
                accounts: ({
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    id: string;
                    active: boolean;
                })[];
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
        update: {
            version: string;
            platform: string;
            repo: string;
            repoSlug: string;
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
