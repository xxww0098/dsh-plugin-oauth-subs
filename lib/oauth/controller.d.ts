/**
 * Auth controller behind the Settings page RPC: owns the per-family token
 * managers, quota store and flow managers, builds the Settings snapshot, and
 * syncs routes to the host. The work behind each entry point lives in plain
 * functions that take the controller: login.ts (flows, keys, imports),
 * account-quota.ts, self-update.ts, account-marks.ts, and each family's
 * accounts.ts (auto-import, identity, catalog discovery, login completion).
 */
import { OAuthFlowManager } from './flow.js';
import { DeviceFlowManager } from './grok/device-flow.js';
import { GlmCliFlowManager } from './glm/cli-flow.js';
import { KiroIdcFlowManager } from './kiro/idc-flow.js';
import { CursorPollFlowManager } from './cursor/pkce-flow.js';
import { ModelSwitch } from './model-switch.js';
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
    profile: string;
    patchPath: string | undefined;
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
    chatgptDiscover: any;
    clineAutoImport: boolean;
    clineAutoImportTried: boolean;
    commandCodeAutoImport: boolean;
    commandCodeAutoImportTried: boolean;
    commandCodeImport: any;
    lastError: Map<string, any>;
    finalizing: Set<string>;
    claims: Map<string, number>;
    tokens: Record<string, TokenManager>;
    quota: QuotaStore;
    identityTried: Map<string, number>;
    fetchFn: any;
    opencodeGo: any;
    opencodeGoAdopted: boolean;
    tokenSweepTimer: any;
    outboundProxy: any;
    setOutboundProxy: any;
    usage: any;
    installReleaseFn: any;
    autoUpdate: boolean;
    updateState: any;
    prefsReady: Promise<void>;
    /** Resolves once the families signed in at construction time are seeded. */
    loginsReady: Promise<void>;
    autoUpdateTimer: any;
    prefsFile: string;
    stateFile: string;
    constructor({ authPath, prefix, origin, settings, patchPath, credentials, grokLogin, onAuthChanged, models, fetchFn, quotaTtlMs, profile, readFileFn, updateEnv, installReleaseFn, cursorAutoImport, cursorImport, cursorDiscover, ollamaAutoImport, ollamaDiscover, kiroDiscover, kimiAutoImport, kimiDiscover, copilotAutoImport, copilotDiscover, devinAutoImport, devinImport, devinDiscover, clineDiscover, clineAutoImport, commandCodeAutoImport, commandCodeImport, chatgptDiscover }: any);
    claim(provider: any): number;
    loggedIn(): Promise<Record<string, boolean>>;
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
    }>;
    catalog(): Promise<Record<string, any>>;
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
    snapshot(fresh?: boolean, opts?: {
        revalidateQuota?: boolean;
    }): Promise<Record<string, any>>;
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
    consumeReset(provider: any, accountId: any, creditId?: any): Promise<any>;
    checkUpdate(payload?: any): Promise<{
        apply: any;
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
        devVersion: string | undefined;
        linked: boolean;
        linkedPath: string | undefined;
        restartKind: string;
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
        status: string;
        error: string;
        latest: undefined;
        assets: never[];
        apply: {
            status: string;
        };
        version: any;
        running: any;
        devVersion: string | undefined;
        linked: boolean;
        linkedPath: string | undefined;
        restartKind: string;
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
    setAutoUpdate(payload?: any): Promise<{
        autoUpdate: boolean;
    }>;
    runAutoUpdate(): Promise<any>;
    startAutoUpdateWatch(options?: any): void;
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
    login(provider: any, options: any): Promise<unknown>;
    completePkce(provider: any, attempt: any, claim: any): Promise<void>;
    completeKimiDevice(attempt: any): Promise<void>;
    completeClineDevice(attempt: any): Promise<void>;
    completeCopilotDevice(attempt: any): Promise<void>;
    completeDevice(provider: any, attempt: any): Promise<void>;
    completeGlm(attempt: any): Promise<void>;
    completeCursor(attempt: any): Promise<void>;
    completeKiroIdc(attempt: any): Promise<void>;
    completeCommandCode(attempt: any, claim: any): Promise<void>;
    useKey(provider: any, key: any, extra: any): Promise<unknown>;
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
        account: Record<string, unknown> | undefined;
        count: any;
    }>;
    setModels(payload?: any): Promise<Record<string, any>>;
    sync(selected?: any, options?: any): Promise<{
        opencodeGoRoute: {
            status: string;
            routes?: undefined;
            error?: undefined;
        } | {
            status: string;
            routes: any[];
            error?: undefined;
        } | {
            status: string;
            error: string;
            routes?: undefined;
        };
        routes: {
            provider: string;
            api: string;
            models: string[];
        }[];
        compaction: {
            status: string;
            error?: undefined;
            policies?: undefined;
        } | {
            status: string;
            error: string;
            policies?: undefined;
        } | {
            status: string;
            policies: number;
            error?: undefined;
        };
    }>;
}
