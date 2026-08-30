/**
 * Auth controller behind the Settings page RPC.
 * Codex PKCE (+ paste callback + import), Grok device-code (primary) + PKCE fallback.
 */
export declare class AuthController {
    #private;
    constructor({ authPath, prefix, origin, settings, grokLogin, onAuthChanged, models, fetchFn, quotaTtlMs, spawnFn, profile }: {
        authPath: any;
        prefix: any;
        origin: any;
        settings: any;
        grokLogin?: string;
        onAuthChanged: any;
        models: any;
        fetchFn?: typeof fetch;
        quotaTtlMs: any;
        spawnFn: any;
        profile: any;
    });
    claim(provider: any): any;
    loggedIn(): Promise<{
        codex: boolean;
        grok: boolean;
        glm: boolean;
        antigravity: boolean;
    }>;
    status(provider: any): Promise<{
        detail?: any;
        quota: any;
        account: any;
        planType: any;
        planLabel: any;
        expiresAt: any;
        region?: undefined;
        scopes?: undefined;
        loggedIn: boolean;
        busy: any;
    } | {
        detail?: any;
        quota: any;
        account: any;
        planType: any;
        planLabel: any;
        region: string;
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
        region?: undefined;
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
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            grok: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            glm: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            antigravity: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
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
    refreshQuota(provider: any, accountId: any): any;
    consumeReset(provider: any, accountId: any): Promise<any>;
    checkUpdate(payload?: {}): Promise<{
        apply: {
            status: string;
            restart?: undefined;
            command?: undefined;
            error?: undefined;
        };
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
        }[];
        platform: string;
        repo: string;
        repoSlug: string;
    } | {
        apply: {
            status: string;
            restart: boolean;
            command: any;
            error?: undefined;
        };
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
        }[];
        platform: string;
        repo: string;
        repoSlug: string;
    } | {
        apply: {
            status: any;
            error: any;
            command: any;
            restart?: undefined;
        };
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
        }[];
        platform: string;
        repo: string;
        repoSlug: string;
    } | {
        status: string;
        error: string;
        latest: any;
        assets: any[];
        apply: {
            status: string;
            restart?: undefined;
            command?: undefined;
            error?: undefined;
        };
        version: string;
        platform: string;
        repo: string;
        repoSlug: string;
    }>;
    login(provider: any, mode: any): Promise<{
        authorizeUrl: any;
        mode: string;
        region: string;
        redirectUri?: undefined;
        verificationUri?: undefined;
        userCode?: undefined;
    } | {
        authorizeUrl: any;
        redirectUri: any;
        mode: string;
        region?: undefined;
        verificationUri?: undefined;
        userCode?: undefined;
    } | {
        authorizeUrl: any;
        verificationUri: any;
        userCode: any;
        mode: string;
        region?: undefined;
        redirectUri?: undefined;
    }>;
    completePkce(provider: any, attempt: any, claim: any): Promise<void>;
    completeDevice(provider: any, attempt: any): Promise<void>;
    completeGlm(attempt: any): Promise<void>;
    useKey(provider: any, key: any, region: any): Promise<{
        region: string;
    }>;
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
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            grok: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            glm: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            antigravity: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
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
        source: any;
        account: {
            account: any;
            planType: any;
            planLabel: any;
            expiresAt: any;
            region?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            region: string;
            expiresAt: any;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            scopes: any;
            expiresAt: any;
            region?: undefined;
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
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            grok: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            glm: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
                loggedIn: boolean;
                busy: any;
            };
            antigravity: {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                expiresAt: any;
                region?: undefined;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
                    id: string;
                    active: boolean;
                })[];
                detail?: any;
                quota: any;
                account: any;
                planType: any;
                planLabel: any;
                region: string;
                expiresAt: any;
                scopes?: undefined;
                loggedIn: boolean;
                busy: any;
            } | {
                activeId: string;
                accounts: ({
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    expiresAt: any;
                    region?: undefined;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    region: string;
                    expiresAt: any;
                    scopes?: undefined;
                    id: string;
                    active: boolean;
                } | {
                    quota: any;
                    account: any;
                    planType: any;
                    planLabel: any;
                    scopes: any;
                    expiresAt: any;
                    region?: undefined;
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
                region?: undefined;
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
