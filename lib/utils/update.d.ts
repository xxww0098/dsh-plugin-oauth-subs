/**
 * Local version + GitHub latest-release check, then the host plugin updater.
 *
 * Compare is GitHub latest vs package.json. Apply is
 * `dsh plugin --profile <web> update dsh-plugin-oauth-subs` — the same
 * pnpm-forward DSH CLI as `dsh plugin add`, not a GitHub zip. A generic
 * zip is not a download row. After a successful apply the running process
 * still has the old module; the user must restart `dsh web`.
 */
import { spawn } from 'node:child_process';
export declare const REPO_SLUG = "xxww0098/dsh-plugin-oauth-subs";
export declare const REPO_URL = "https://github.com/xxww0098/dsh-plugin-oauth-subs";
export declare const RELEASES_API = "https://api.github.com/repos/xxww0098/dsh-plugin-oauth-subs/releases/latest";
export declare const PLATFORMS: readonly string[];
export declare const PLUGIN_NAME = "dsh-plugin-oauth-subs";
export declare const DEFAULT_PROFILE = "web";
export declare const DSH_BIN = "dsh";
export declare const PLUGIN_UPDATE_TIMEOUT_MS = 180000;
export declare function installedVersion(): string;
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
export declare function localUpdateInfo(platform?: NodeJS.Platform): {
    version: string;
    platform: string;
    repo: string;
    repoSlug: string;
};
export declare function fetchLatest({ fetchFn, current, platform, timeoutMs }?: {
    fetchFn?: typeof fetch;
    platform?: NodeJS.Platform;
    timeoutMs?: number;
}): Promise<{
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
}>;
/** `$DSH_HOME/profiles/<name>` from Cordis `ctx.baseUrl`, else web. */
export declare function profileFromBaseUrl(baseUrl: any): string;
export declare function pluginUpdateArgs(profile?: string): string[];
export declare function pluginUpdateCommand(profile?: string): string;
/**
 * Spawn PATH `dsh` with the profile plugin updater. Does not install
 * `@deepseek-ai/dsh` and does not kill the running profile.
 */
export declare function runPluginUpdate({ spawnFn, profile, timeoutMs, env, }?: {
    spawnFn?: typeof spawn;
    profile?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
}): Promise<unknown>;
