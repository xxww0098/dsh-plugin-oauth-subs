/**
 * Auth controller behind the Settings page RPC.
 * Codex PKCE (+ paste callback + import), Grok device-code (primary) + PKCE fallback.
 */
import { OAuthFlowManager } from './flow.js';
import { DeviceFlowManager } from './grok/device-flow.js';
import { GlmCliFlowManager } from './glm/cli-flow.js';
import { KiroIdcFlowManager } from './kiro/idc-flow.js';
import { CursorPollFlowManager } from './cursor/pkce-flow.js';
import { ModelSwitch } from './models.js';
import { TokenManager } from './tokens.js';
import { QuotaStore } from './quota.js';
/** How often the background sweep re-checks stored credential expiry. */
export declare const TOKEN_SWEEP_INTERVAL_MS = 60000;
export declare class AuthController {
    #private;
    authPath: string;
    prefix: string;
    origin: () => string;
    settings: any;
    credentials: any;
    grokLogin: string;
    spawnFn: any;
    exitFn: any;
    prefsPath: string;
    statePath: string;
    autoUpdate: any;
    autoUpdateState: any;
    prefsReady: Promise<any>;
    autoUpdateBusy: boolean;
    autoUpdateTimer: any;
    dshStuckTarget: string | undefined;
    profile: string;
    readFileFn: any;
    updateEnv: any;
    onAuthChanged: ((provider?: string) => void) | undefined;
    models: ModelSwitch;
    flows: OAuthFlowManager;
    devices: DeviceFlowManager;
    glmFlows: GlmCliFlowManager;
    kiroFlows: KiroIdcFlowManager;
    cursorFlows: CursorPollFlowManager;
    cursorAutoImport: boolean;
    cursorImport: any;
    cursorAutoImportTried: boolean;
    cursorDiscover: any;
    ollamaAutoImport: boolean;
    ollamaAutoImportTried: boolean;
    ollamaDiscover: any;
    kiroDiscover: any;
    kimiAutoImport: boolean;
    kimiAutoImportTried: boolean;
    kimiDiscover: any;
    copilotAutoImport: boolean;
    copilotAutoImportTried: boolean;
    copilotDiscover: any;
    devinAutoImport: boolean;
    devinImport: any;
    devinAutoImportTried: boolean;
    devinDiscover: any;
    clineDiscover: any;
    clineAutoImport: boolean;
    clineAutoImportTried: boolean;
    lastError: Map<string, any>;
    finalizing: Set<string>;
    claims: Map<string, number>;
    tokens: Record<string, TokenManager>;
    quota: QuotaStore;
    fetchFn: any;
    opencodeGo: any;
    opencodeGoAdopted: boolean;
    tokenSweepTimer: any;
    outboundProxy: any;
    setOutboundProxy: any;
    constructor({ authPath, prefix, origin, settings, credentials, grokLogin, onAuthChanged, models, fetchFn, quotaTtlMs, spawnFn, profile, readFileFn, updateEnv, exitFn, prefsPath, statePath, cursorAutoImport, cursorImport, cursorDiscover, ollamaAutoImport, ollamaDiscover, kiroDiscover, kimiAutoImport, kimiDiscover, copilotAutoImport, copilotDiscover, devinAutoImport, devinImport, devinDiscover, clineDiscover, clineAutoImport }: any);
    claim(provider: any): number;
    loggedIn(): Promise<{
        codex: boolean;
        grok: boolean;
        glm: boolean;
        kiro: boolean;
        antigravity: boolean;
        cursor: boolean;
        ollama: boolean;
        kimi: boolean;
        copilot: boolean;
        devin: boolean;
        cline: boolean;
    }>;
    status(provider: any): Promise<{
        detail?: any;
        quota: {
            status: string;
            planType?: undefined;
            planLabel?: undefined;
            account?: undefined;
            subscriptionStatus?: undefined;
            hasGrokCodeAccess?: undefined;
            updatedAt?: undefined;
            error?: undefined;
            rows?: undefined;
            resetCredits?: undefined;
        } | {
            status: any;
            planType: any;
            planLabel: any;
            account: any;
            subscriptionStatus: any;
            hasGrokCodeAccess: any;
            updatedAt: any;
            error: any;
            rows: any;
            resetCredits: {
                nextExpiresAt?: any;
                availableCount: any;
                credits: any;
            };
        };
        loggedIn: boolean;
        busy: boolean;
    } | {
        detail?: any;
        quota: {
            status: string;
            planType?: undefined;
            planLabel?: undefined;
            account?: undefined;
            subscriptionStatus?: undefined;
            hasGrokCodeAccess?: undefined;
            updatedAt?: undefined;
            error?: undefined;
            rows?: undefined;
            resetCredits?: undefined;
        } | {
            status: any;
            planType: any;
            planLabel: any;
            account: any;
            subscriptionStatus: any;
            hasGrokCodeAccess: any;
            updatedAt: any;
            error: any;
            rows: any;
            resetCredits: {
                nextExpiresAt?: any;
                availableCount: any;
                credits: any;
            };
        };
        account: any;
        planType: any;
        planLabel: any;
        expiresAt: any;
        region?: undefined;
        needsValidation?: undefined;
        validationUrl?: undefined;
        method?: undefined;
        methodLabel?: undefined;
        organizationName?: undefined;
        scopes?: undefined;
        loggedIn: boolean;
        busy: boolean;
    } | {
        detail?: any;
        quota: {
            status: string;
            planType?: undefined;
            planLabel?: undefined;
            account?: undefined;
            subscriptionStatus?: undefined;
            hasGrokCodeAccess?: undefined;
            updatedAt?: undefined;
            error?: undefined;
            rows?: undefined;
            resetCredits?: undefined;
        } | {
            status: any;
            planType: any;
            planLabel: any;
            account: any;
            subscriptionStatus: any;
            hasGrokCodeAccess: any;
            updatedAt: any;
            error: any;
            rows: any;
            resetCredits: {
                nextExpiresAt?: any;
                availableCount: any;
                credits: any;
            };
        };
        account: string | undefined;
        planType: any;
        planLabel: any;
        region: string;
        expiresAt: any;
        needsValidation?: undefined;
        validationUrl?: undefined;
        method?: undefined;
        methodLabel?: undefined;
        organizationName?: undefined;
        scopes?: undefined;
        loggedIn: boolean;
        busy: boolean;
    } | {
        detail?: any;
        quota: {
            status: string;
            planType?: undefined;
            planLabel?: undefined;
            account?: undefined;
            subscriptionStatus?: undefined;
            hasGrokCodeAccess?: undefined;
            updatedAt?: undefined;
            error?: undefined;
            rows?: undefined;
            resetCredits?: undefined;
        } | {
            status: any;
            planType: any;
            planLabel: any;
            account: any;
            subscriptionStatus: any;
            hasGrokCodeAccess: any;
            updatedAt: any;
            error: any;
            rows: any;
            resetCredits: {
                nextExpiresAt?: any;
                availableCount: any;
                credits: any;
            };
        };
        account: any;
        planType: any;
        planLabel: any;
        expiresAt: any;
        needsValidation: boolean;
        validationUrl: any;
        region?: undefined;
        method?: undefined;
        methodLabel?: undefined;
        organizationName?: undefined;
        scopes?: undefined;
        loggedIn: boolean;
        busy: boolean;
    } | {
        detail?: any;
        quota: {
            status: string;
            planType?: undefined;
            planLabel?: undefined;
            account?: undefined;
            subscriptionStatus?: undefined;
            hasGrokCodeAccess?: undefined;
            updatedAt?: undefined;
            error?: undefined;
            rows?: undefined;
            resetCredits?: undefined;
        } | {
            status: any;
            planType: any;
            planLabel: any;
            account: any;
            subscriptionStatus: any;
            hasGrokCodeAccess: any;
            updatedAt: any;
            error: any;
            rows: any;
            resetCredits: {
                nextExpiresAt?: any;
                availableCount: any;
                credits: any;
            };
        };
        account: any;
        planType: any;
        planLabel: any;
        method: any;
        methodLabel: string | undefined;
        expiresAt: any;
        region?: undefined;
        needsValidation?: undefined;
        validationUrl?: undefined;
        organizationName?: undefined;
        scopes?: undefined;
        loggedIn: boolean;
        busy: boolean;
    } | {
        detail?: any;
        quota: {
            status: string;
            planType?: undefined;
            planLabel?: undefined;
            account?: undefined;
            subscriptionStatus?: undefined;
            hasGrokCodeAccess?: undefined;
            updatedAt?: undefined;
            error?: undefined;
            rows?: undefined;
            resetCredits?: undefined;
        } | {
            status: any;
            planType: any;
            planLabel: any;
            account: any;
            subscriptionStatus: any;
            hasGrokCodeAccess: any;
            updatedAt: any;
            error: any;
            rows: any;
            resetCredits: {
                nextExpiresAt?: any;
                availableCount: any;
                credits: any;
            };
        };
        account: any;
        planType: any;
        planLabel: any;
        method: any;
        methodLabel: string | undefined;
        organizationName: any;
        expiresAt: any;
        region?: undefined;
        needsValidation?: undefined;
        validationUrl?: undefined;
        scopes?: undefined;
        loggedIn: boolean;
        busy: boolean;
    } | {
        detail?: any;
        quota: {
            status: string;
            planType?: undefined;
            planLabel?: undefined;
            account?: undefined;
            subscriptionStatus?: undefined;
            hasGrokCodeAccess?: undefined;
            updatedAt?: undefined;
            error?: undefined;
            rows?: undefined;
            resetCredits?: undefined;
        } | {
            status: any;
            planType: any;
            planLabel: any;
            account: any;
            subscriptionStatus: any;
            hasGrokCodeAccess: any;
            updatedAt: any;
            error: any;
            rows: any;
            resetCredits: {
                nextExpiresAt?: any;
                availableCount: any;
                credits: any;
            };
        };
        account: any;
        planType: any;
        planLabel: any;
        scopes: any;
        expiresAt: any;
        region?: undefined;
        needsValidation?: undefined;
        validationUrl?: undefined;
        method?: undefined;
        methodLabel?: undefined;
        organizationName?: undefined;
        loggedIn: boolean;
        busy: boolean;
    }>;
    catalog(): Promise<{}>;
    /**
     * Startup discovery for every signed-in family with a live catalog. The
     * picker otherwise keeps the static floor until someone logs in or hits
     * quota refresh, which is how region-gated / retired rows stay offered.
     * Re-syncs once if any family's picker rows changed.
     */
    warmCatalogs(): Promise<void>;
    /**
     * RPC payload for the Settings page. The Settings half is a classic script
     * that reads this as plain JSON. Leaving the return type to inference made
     * the emitted `snapshot` / `switchAccount` / `setModels` declarations ~25k
     * lines each (they all return this method), roughly doubling the published
     * `lib/`. The callers are untyped on purpose — do not "restore" the inferred
     * type without re-checking `lib/` size.
     */
    snapshot(): Promise<Record<string, any>>;
    opencodeGoSnapshot(options?: any): Promise<{
        id: string;
        loggedIn: boolean;
        busy: boolean;
        activeId: any;
        accounts: any;
        cookieSet: boolean;
        workspaceId: any;
        apiKeySet: boolean;
        configured: boolean;
        quota: any;
    }>;
    saveOpencodeGo(payload?: any): Promise<{
        id: string;
        loggedIn: boolean;
        busy: boolean;
        activeId: any;
        accounts: any;
        cookieSet: boolean;
        workspaceId: any;
        apiKeySet: boolean;
        configured: boolean;
        quota: any;
    }>;
    switchOpencodeGo(id: any): Promise<{
        id: string;
        loggedIn: boolean;
        busy: boolean;
        activeId: any;
        accounts: any;
        cookieSet: boolean;
        workspaceId: any;
        apiKeySet: boolean;
        configured: boolean;
        quota: any;
    }>;
    logoutOpencodeGo(id: any): Promise<{
        id: string;
        loggedIn: boolean;
        busy: boolean;
        activeId: any;
        accounts: any;
        cookieSet: boolean;
        workspaceId: any;
        apiKeySet: boolean;
        configured: boolean;
        quota: any;
    }>;
    clearOpencodeGo(field: any, id: any): Promise<{
        id: string;
        loggedIn: boolean;
        busy: boolean;
        activeId: any;
        accounts: any;
        cookieSet: boolean;
        workspaceId: any;
        apiKeySet: boolean;
        configured: boolean;
        quota: any;
    }>;
    refreshOpencodeGoQuota(id: any): Promise<{
        id: string;
        loggedIn: boolean;
        busy: boolean;
        activeId: any;
        accounts: any;
        cookieSet: boolean;
        workspaceId: any;
        apiKeySet: boolean;
        configured: boolean;
        quota: any;
    }>;
    refreshQuota(provider: any, accountId?: any): any;
    consumeReset(provider: any, accountId: any): Promise<any>;
    checkUpdate(payload?: any): Promise<{
        apply: {
            status: string;
            restart?: undefined;
            command?: undefined;
            error?: undefined;
        };
        version: any;
        status: string;
        latest: {
            tag: string | undefined;
            name: any;
            url: any;
            publishedAt: string | undefined;
        };
        assets: {
            platform: string;
            current: boolean;
            name: any;
            url: any;
            size: any;
        }[];
        running: any;
        disk: any;
        resolved: any;
        runningPath: string;
        diskPath: string;
        resolvedPath: any;
        copies: {
            path: string;
            version: any;
        }[];
        staleProcess: boolean;
        staleLoad: boolean;
        platform: string;
        repo: string;
        repoSlug: string;
    } | {
        version: any;
        disk: any;
        status: string;
        apply: {
            status: string;
            restart: boolean;
            command: string;
            error?: undefined;
        };
        running: any;
        resolved: any;
        runningPath: string;
        diskPath: string;
        resolvedPath: any;
        copies: {
            path: string;
            version: any;
        }[];
        staleProcess: boolean;
        staleLoad: boolean;
        platform: string;
        repo: string;
        repoSlug: string;
        latest: {
            tag: string | undefined;
            name: any;
            url: any;
            publishedAt: string | undefined;
        };
        assets: {
            platform: string;
            current: boolean;
            name: any;
            url: any;
            size: any;
        }[];
    } | {
        version: any;
        apply: {
            status: string;
            error: string | undefined;
            command: string;
            restart?: undefined;
        };
        running: any;
        disk: any;
        resolved: any;
        runningPath: string;
        diskPath: string;
        resolvedPath: any;
        copies: {
            path: string;
            version: any;
        }[];
        staleProcess: boolean;
        staleLoad: boolean;
        platform: string;
        repo: string;
        repoSlug: string;
        status: string;
        latest: {
            tag: string | undefined;
            name: any;
            url: any;
            publishedAt: string | undefined;
        };
        assets: {
            platform: string;
            current: boolean;
            name: any;
            url: any;
            size: any;
        }[];
    } | {
        status: string;
        error: string;
        latest: undefined;
        assets: never[];
        apply: {
            status: string;
            restart?: undefined;
            command?: undefined;
            error?: undefined;
        };
        version: any;
        running: any;
        disk: any;
        resolved: any;
        runningPath: string;
        diskPath: string;
        resolvedPath: any;
        copies: {
            path: string;
            version: any;
        }[];
        staleProcess: boolean;
        staleLoad: boolean;
        platform: string;
        repo: string;
        repoSlug: string;
    }>;
    checkDshUpdate(payload?: any): Promise<{
        apply: {
            status: string;
            error?: undefined;
            command?: undefined;
            restart?: undefined;
            after?: undefined;
        };
        version: any;
        status: string;
        canUpdate: boolean;
        latestTag: {
            tag: any;
            version: any;
            name: any;
            url: any;
            publishedAt: any;
        } | undefined;
        npm: {
            version: any;
            stable: any;
            publishedAt: any;
            distTags: any;
            versions: string[];
        } | undefined;
        binPath: string | undefined;
        realPath: string | undefined;
        packagePath: string | undefined;
        platform: string;
        repo: string;
        repoSlug: string;
        npmPackage: string;
    } | {
        version: any;
        status: string;
        apply: {
            status: any;
            error: any;
            command: any;
            restart: any;
            after: any;
        };
        binPath: string | undefined;
        realPath: string | undefined;
        packagePath: string | undefined;
        platform: string;
        repo: string;
        repoSlug: string;
        npmPackage: string;
        canUpdate: boolean;
        latestTag: {
            tag: any;
            version: any;
            name: any;
            url: any;
            publishedAt: any;
        } | undefined;
        npm: {
            version: any;
            stable: any;
            publishedAt: any;
            distTags: any;
            versions: string[];
        } | undefined;
    } | {
        status: string;
        error: string;
        latestTag: undefined;
        npm: undefined;
        canUpdate: boolean;
        apply: {
            status: string;
            error?: undefined;
            command?: undefined;
            restart?: undefined;
            after?: undefined;
        };
        version: any;
        binPath: string | undefined;
        realPath: string | undefined;
        packagePath: string | undefined;
        platform: string;
        repo: string;
        repoSlug: string;
        npmPackage: string;
    }>;
    setAutoUpdate(payload?: any): Promise<any>;
    startAutoUpdateWatch({ intervalMs }?: {
        intervalMs?: number | undefined;
    }): void;
    stopAutoUpdateWatch(): void;
    /**
     * Background credential sweep — CLIProxyAPI's authAutoRefreshLoop shape.
     * TokenManager refreshes lazily on request; without a sweep the first call
     * after an idle stretch pays the refresh RTT, and a refresh token that died
     * while idle only surfaces mid-request. Each family's own preemptMs decides
     * whether a stored login is due, so the sweep stays provider-agnostic.
     */
    startTokenSweep({ intervalMs }?: {
        intervalMs?: number | undefined;
    }): void;
    stopTokenSweep(): void;
    sweepTokensOnce(): Promise<void>;
    runAutoUpdate(): Promise<{
        plugin: any;
        dsh: any;
    }>;
    login(provider: any, options: any): Promise<{
        authorizeUrl: any;
        verificationUri: any;
        userCode: any;
        mode: string;
        kind: string;
        startUrl: any;
        redirectUri?: undefined;
        machineId?: undefined;
    } | {
        authorizeUrl: any;
        redirectUri: any;
        mode: string;
        machineId: string;
        verificationUri?: undefined;
        userCode?: undefined;
        kind?: undefined;
        startUrl?: undefined;
    } | {
        authorizeUrl: string;
        mode: string;
        region: string;
        redirectUri?: undefined;
        verificationUri?: undefined;
        userCode?: undefined;
    } | {
        authorizeUrl: string;
        mode: string;
        region?: undefined;
        redirectUri?: undefined;
        verificationUri?: undefined;
        userCode?: undefined;
    } | {
        authorizeUrl: any;
        redirectUri: string;
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
    completeKimiDevice(attempt: any): Promise<void>;
    /**
     * Cline login is two hops: the WorkOS device poll yields a WorkOS token
     * pair, and `/api/v1/auth/register` exchanges it for the Cline session
     * (`usr-…` account id + refresh token). Only the second hop produces
     * something this plugin can use.
     */
    completeClineDevice(attempt: any): Promise<void>;
    completeCopilotDevice(attempt: any): Promise<void>;
    completeDevice(provider: any, attempt: any): Promise<void>;
    completeGlm(attempt: any): Promise<void>;
    completeCursor(attempt: any): Promise<void>;
    completeKiroIdc(attempt: any): Promise<void>;
    useKey(provider: any, key: any, extra: any): Promise<{
        method: any;
        account: {
            account: any;
            planType: any;
            planLabel: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: string | undefined;
            planType: any;
            planLabel: any;
            region: string;
            expiresAt: any;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            expiresAt: any;
            needsValidation: boolean;
            validationUrl: any;
            region?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            method: any;
            methodLabel: string | undefined;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            method: any;
            methodLabel: string | undefined;
            organizationName: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            scopes: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
        } | undefined;
        count: number;
    } | {
        account: {
            account: any;
            planType: any;
            planLabel: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: string | undefined;
            planType: any;
            planLabel: any;
            region: string;
            expiresAt: any;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            expiresAt: any;
            needsValidation: boolean;
            validationUrl: any;
            region?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            method: any;
            methodLabel: string | undefined;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            method: any;
            methodLabel: string | undefined;
            organizationName: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            scopes: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
        } | undefined;
        region?: undefined;
    } | {
        region: string;
        account?: undefined;
    }>;
    manual(provider: any, input: any): Promise<void>;
    cancel(provider: any): Promise<void>;
    logout(provider: any, id: any): Promise<{
        id: string;
        loggedIn: boolean;
        busy: boolean;
        activeId: any;
        accounts: any;
        cookieSet: boolean;
        workspaceId: any;
        apiKeySet: boolean;
        configured: boolean;
        quota: any;
    } | undefined>;
    switchAccount(provider: any, id: any): Promise<Record<string, any>>;
    importFrom(provider: any): Promise<{
        source: any;
        account: {
            account: any;
            planType: any;
            planLabel: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: string | undefined;
            planType: any;
            planLabel: any;
            region: string;
            expiresAt: any;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            expiresAt: any;
            needsValidation: boolean;
            validationUrl: any;
            region?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            method: any;
            methodLabel: string | undefined;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            organizationName?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            method: any;
            methodLabel: string | undefined;
            organizationName: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            scopes?: undefined;
        } | {
            account: any;
            planType: any;
            planLabel: any;
            scopes: any;
            expiresAt: any;
            region?: undefined;
            needsValidation?: undefined;
            validationUrl?: undefined;
            method?: undefined;
            methodLabel?: undefined;
            organizationName?: undefined;
        } | undefined;
        count: any;
    }>;
    setModels(payload?: any): Promise<Record<string, any>>;
    sync(selected?: any, options?: any): Promise<{
        opencodeGoRoute: {
            status: string;
            error?: undefined;
            routes?: undefined;
        } | {
            status: string;
            error: string;
            routes?: undefined;
        } | {
            status: string;
            routes: any[];
            error?: undefined;
        };
        routes: {
            provider: string;
            api: any;
            models: any;
        }[];
    }>;
}
