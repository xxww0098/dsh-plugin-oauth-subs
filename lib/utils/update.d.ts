/**
 * Local version + GitHub latest-release check, then the host plugin updater.
 *
 * About "当前版本" is the package this process actually loaded
 * (`import.meta.url` → `../../package.json`). Profile
 * `node_modules/dsh-plugin-oauth-subs/package.json` can already be newer
 * (pnpm `github:` write) while Cordis still requires another copy.
 * Compare GitHub against the running module. When disk is latest but the
 * process is behind, still `add <repo>#vX.Y.Z`. `.dsh-module-fallback` and
 * `$DSH_HOME/profiles/node_modules` are extra copies we report, not the
 * About version.
 *
 * `dsh plugin update` is `pnpm update` and can no-op on a git spec.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
export declare function modulePackageJsonPath(): string;
export declare const REPO_SLUG = "xxww0098/dsh-plugin-oauth-subs";
export declare const REPO_URL = "https://github.com/xxww0098/dsh-plugin-oauth-subs";
export declare const RELEASES_API = "https://api.github.com/repos/xxww0098/dsh-plugin-oauth-subs/releases/latest";
export declare const PLATFORMS: readonly string[];
export declare const PLUGIN_NAME = "dsh-plugin-oauth-subs";
export declare const DEFAULT_PROFILE = "web";
export declare const DSH_BIN = "dsh";
export declare const PLUGIN_UPDATE_TIMEOUT_MS = 180000;
/** Version of the module this process actually loaded. Always re-reads disk. */
export declare function installedVersion({ readFileFn }?: {}): any;
/** Newer of two semver-ish tags. Empty / unparseable values lose. */
export declare function fresherVersion(left: any, right: any): string;
export declare function parseVersion(tag: any): {
    major: number;
    minor: number;
    patch: number;
    raw: string;
};
export declare function compareVersions(left: any, right: any): number;
export declare function hostPlatform(platform?: NodeJS.Platform): "linux" | "win" | "mac";
export declare function classifyAsset(name: any): "linux" | "win" | "mac" | "any";
export declare function pickDownloads(assets: any, host: any): {
    platform: string;
    current: boolean;
    name: any;
    url: any;
    size: any;
}[];
export declare function localUpdateInfo(platform?: NodeJS.Platform, opts?: {}): {
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
};
/** GitHub `published_at` as `YYYY-MM-DD HH:mm:ss` in Asia/Shanghai. */
export declare function formatPublishedAt(iso: any): string;
export declare function fetchLatest({ fetchFn, current, platform, timeoutMs, profile, env, readFileFn, }?: {
    fetchFn?: typeof fetch;
    platform?: NodeJS.Platform;
    timeoutMs?: number;
}): Promise<{
    version: any;
    status: string;
    latest: {
        tag: string;
        name: any;
        url: any;
        publishedAt: string;
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
}>;
/** `$DSH_HOME/profiles/<name>` from Cordis `ctx.baseUrl`, else web. */
export declare function profileFromBaseUrl(baseUrl: any): string;
export declare function pluginUpdateArgs(profile?: string): string[];
export declare function pluginUpdateCommand(profile?: string): string;
export declare function pluginAddArgs(profile?: string, source?: string): string[];
export declare function pluginRemoveArgs(profile?: string): string[];
/** GitHub tag → `dsh plugin add` source. `v0.0.71` and `0.0.71` both pin `#v0.0.71`. */
export declare function releaseInstallSource(tag: any): string;
export declare function workaroundCommand(profile?: string, source?: string): string;
export declare function profilePluginPackageJson(profile?: string, env?: NodeJS.ProcessEnv): string;
export declare function extraPluginManifests(profile?: string, env?: NodeJS.ProcessEnv): string[];
export declare function resolveProfilePluginManifest(profile?: string, env?: NodeJS.ProcessEnv, { resolveFn }?: {}): any;
export declare function canonicalPath(path: any, { realpathFn }?: {}): string;
export declare function readPackageVersion(path: any, { readFileFn }?: {
    readFileFn?: typeof readFileSync;
}): any;
/** True when `after` reached `latest`, or moved forward when latest is unknown. */
export declare function versionAdvanced(before: any, after: any, latest: any): boolean;
/**
 * Spawn PATH `dsh` with the given plugin args. Exit 0 is only a spawn
 * success — `applyHostUpdate` re-reads the profile package.json.
 */
export declare function runDshPlugin({ spawnFn, profile, args, timeoutMs, env, }?: {
    spawnFn?: typeof spawn;
    profile?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}): Promise<unknown>;
/**
 * Spawn PATH `dsh plugin update`. Exit 0 is spawn-only; prefer
 * `applyHostUpdate` when the on-disk version must have moved.
 */
export declare function runPluginUpdate({ spawnFn, profile, timeoutMs, env, }?: {
    spawnFn?: typeof spawn;
    profile?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}): Promise<unknown>;
/**
 * Apply a host update and confirm the profile's package.json moved.
 * `dsh plugin update` is `pnpm update` and can no-op on a git-pinned
 * install; if the version did not reach `latest`, retry
 * `dsh plugin add <repo>#vX.Y.Z`.
 */
export declare function applyHostUpdate({ spawnFn, profile, latest, timeoutMs, env, readFileFn, }?: {
    spawnFn?: typeof spawn;
    profile?: string;
    timeoutMs?: number;
}): Promise<any>;
