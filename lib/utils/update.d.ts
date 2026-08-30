/**
 * Local version + GitHub latest-release check.
 * One zip is enough for all hosts; win/mac/linux rows share it unless
 * the release ships platform-named assets.
 */
export declare const REPO_SLUG = "xxww0098/dsh-plugin-oauth-subs";
export declare const REPO_URL = "https://github.com/xxww0098/dsh-plugin-oauth-subs";
export declare const RELEASES_API = "https://api.github.com/repos/xxww0098/dsh-plugin-oauth-subs/releases/latest";
export declare const PLATFORMS: readonly string[];
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
    generic: boolean;
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
        generic: boolean;
    }[];
    platform: string;
    repo: string;
    repoSlug: string;
}>;
