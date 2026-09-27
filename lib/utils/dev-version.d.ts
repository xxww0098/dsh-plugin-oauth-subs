/**
 * Local dev build stamp. `npm run dev-build` bumps `.dev-build.json`
 * (git-ignored) so a linked working tree reports `0.0.105-dev.<n>` in About
 * instead of the release number — the repo manifest itself stays a release
 * version, and every dev build is distinguishable from the previous one.
 */
export declare const DEV_BUILD_FILE = ".dev-build.json";
export declare function devBuildPath(root: any): string;
/** `{ base, n, at }` from a stamp file; undefined when missing or malformed. */
export declare function parseDevBuild(text: any): {
    base: any;
    n: number;
    at: any;
} | undefined;
/** Next stamp: the same base keeps counting, a new release version restarts at 1. */
export declare function nextDevBuild(previous: any, base: any, at: any): {
    base: any;
    n: any;
    at: any;
};
/** `0.0.105-dev.3` when the linked tree carries a stamp for the running version. */
export declare function readDevVersion(root: any, base: any, { readFileFn }?: any): string | undefined;
