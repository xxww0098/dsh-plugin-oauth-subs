/**
 * Plugin self-update for AuthController: version check + install, the
 * persisted auto-update switch, and its hourly background pass.
 */
import type { AuthController } from './controller.js';
/**
 * Version check + self-install. `apply` downloads the latest tag tarball and
 * swaps the installed package dirs in place — the profile layout is the same
 * on desktop and web, so this never needs `dsh`/`npm`. The new copy loads on
 * the next host start (`apply.restart` says which restart to ask for). If no
 * installed dir exists the apply degrades to a `manual` command hint.
 */
export declare function checkUpdate(ctl: AuthController, payload?: any): Promise<{
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
/** Persist the auto-update switch; turning it on runs one pass now. */
export declare function setAutoUpdate(ctl: AuthController, payload?: any): Promise<{
    autoUpdate: boolean;
}>;
/**
 * One auto-update pass: check the latest tag and self-install it when newer.
 * The outcome lands in update-state.json so About can show what the
 * background loop last did.
 */
export declare function runAutoUpdate(ctl: AuthController): Promise<any>;
export declare function startAutoUpdateWatch(ctl: AuthController, { intervalMs }?: {
    intervalMs?: number | undefined;
}): void;
export declare function stopAutoUpdateWatch(ctl: AuthController): void;
