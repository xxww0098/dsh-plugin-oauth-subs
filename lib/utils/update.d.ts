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
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
export declare function modulePackageJsonPath(): string;
export declare const REPO_SLUG = "xxww0098/dsh-plugin-oauth-subs";
export declare const REPO_URL = "https://github.com/xxww0098/dsh-plugin-oauth-subs";
export declare const RELEASES_API = "https://api.github.com/repos/xxww0098/dsh-plugin-oauth-subs/releases/latest";
export declare const RELEASES_LATEST_HTML = "https://github.com/xxww0098/dsh-plugin-oauth-subs/releases/latest";
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
    prerelease: string;
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
export declare function githubRequestHeaders(userAgent: any, env?: NodeJS.ProcessEnv): {
    accept: string;
    'user-agent': any;
};
/** `/releases/tag/v0.0.84` or `/tags/dsh-v0.1.5-alpha.2` from a github.com URL. */
export declare function tagFromGithubReleaseUrl(url: any): string;
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
 * `dsh plugin …` must hit the copy serving this page. PATH `dsh` is often
 * missing in a GUI-launched process, and when present it may be a different
 * install than `DSH_BIN_PATH` / `process.argv[1]`.
 */
export declare function dshPluginBin(env?: NodeJS.ProcessEnv): string;
/**
 * Spawn the running DSH with the given plugin args. Exit 0 is only a spawn
 * success — `applyHostUpdate` re-reads the profile package.json.
 */
export declare function runDshPlugin({ spawnFn, profile, args, timeoutMs, env, execPath, }?: {
    spawnFn?: typeof spawn;
    profile?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    execPath?: string;
}): Promise<unknown>;
/**
 * Spawn `dsh plugin update` via the running DSH copy. Exit 0 is spawn-only;
 * prefer `applyHostUpdate` when the on-disk version must have moved.
 */
export declare function runPluginUpdate({ spawnFn, profile, timeoutMs, env, execPath, }?: {
    spawnFn?: typeof spawn;
    profile?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    execPath?: string;
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
export declare const DSH_REPO_SLUG = "deepseek-ai/deepseek-harness";
export declare const DSH_REPO_URL = "https://github.com/deepseek-ai/deepseek-harness";
export declare const DSH_TAGS_API = "https://api.github.com/repos/deepseek-ai/deepseek-harness/tags";
export declare const DSH_RELEASES_API = "https://api.github.com/repos/deepseek-ai/deepseek-harness/releases";
export declare const DSH_RELEASES_LATEST_HTML = "https://github.com/deepseek-ai/deepseek-harness/releases/latest";
export declare const DSH_NPM_PACKAGE = "@deepseek-ai/dsh";
export declare const DSH_NPM_REGISTRY_API = "https://registry.npmjs.org/@deepseek-ai/dsh";
export declare const DSH_UPDATE_TIMEOUT_MS = 180000;
/** npm registry versions newest-first; only these can be installed with npm -g. */
export declare function listDshInstallVersions(npmData: any): string[];
/**
 * The `@deepseek-ai/dsh` copy this process runs from: `DSH_BIN_PATH`, else the
 * entry script (`process.argv[1]`), realpath'd and walked up to its
 * package.json. Nothing else is consulted: `$_`, PATH `dsh`, global prefixes
 * and `dsh --version` all named some *other* install (the running Homebrew
 * copy vs `npm prefix -g`), so About flipped between versions and the updater
 * chased a copy that was not the one serving the page.
 */
export declare function resolveDshInstall(_platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, { realpathFn, readFileFn, existsSyncFn }?: {
    realpathFn?: typeof realpathSync;
    readFileFn?: typeof readFileSync;
    existsSyncFn?: typeof existsSync;
}): {
    binPath: string;
    realPath: string;
    packagePath: string;
    version: any;
};
export declare function localDshInfo(platform?: NodeJS.Platform, opts?: {}): {
    version: any;
    binPath: string;
    realPath: string;
    packagePath: string;
    platform: string;
    repo: string;
    repoSlug: string;
    npmPackage: string;
};
export declare function fetchDshLatest({ fetchFn, current, platform, timeoutMs, env, readFileFn, realpathFn, existsSyncFn, }?: {
    fetchFn?: typeof fetch;
    platform?: NodeJS.Platform;
    timeoutMs?: number;
}): Promise<{
    version: any;
    status: string;
    canUpdate: boolean;
    latestTag: {
        tag: any;
        version: any;
        name: any;
        url: any;
        publishedAt: any;
    };
    npm: {
        version: any;
        publishedAt: any;
        distTags: {};
        versions: any[];
    };
    binPath: string;
    realPath: string;
    packagePath: string;
    platform: string;
    repo: string;
    repoSlug: string;
    npmPackage: string;
}>;
/**
 * npm global prefix that owns `packagePath` — `<prefix>/lib/node_modules/…`
 * on POSIX, `<prefix>/node_modules/…` on Windows. '' for pnpm / bun / unknown
 * layouts, which fall back to npm's own `prefix -g`.
 */
export declare function dshInstallPrefix(packagePath: any, platform?: NodeJS.Platform): string;
export declare function dshUpdateArgs(targetVersion: any, prefix?: string): string[];
export declare function dshUpdateCommand(targetVersion: any, prefix?: string): string;
export declare const DSH_HOST_VERSION_STAMP_RE: RegExp;
export declare function pluginClientJsPath(): string;
/** Write local DSH version into the served client.js static file. */
export declare function stampDshHostVersion(clientPath: any, version: any, { readFileFn, writeFileFn }?: {
    readFileFn?: typeof readFileSync;
    writeFileFn?: typeof writeFileSync;
}): boolean;
/** Detached re-exec of this dsh web process after the listen port is free. */
export declare function scheduleDshWebRestart({ spawnFn, env, delaySec, execPath, argv, cwd, platform, }?: {
    spawnFn?: typeof spawn;
    env?: NodeJS.ProcessEnv;
    delaySec?: number;
    execPath?: string;
    argv?: string[];
    cwd?: string;
    platform?: NodeJS.Platform;
}): {
    ok: boolean;
    command: string;
};
export declare function applyHostDshUpdate({ spawnFn, targetVersion, timeoutMs, env, readFileFn, realpathFn, existsSyncFn, }?: {
    spawnFn?: typeof spawn;
    timeoutMs?: number;
}): Promise<unknown>;
