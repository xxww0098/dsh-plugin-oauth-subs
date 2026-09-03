/**
 * User-owned local Cursor login reuse. This is not a second OAuth.
 *
 * Resolution (Import click / empty-roster auto-import):
 *   1. CURSOR_ACCESS_TOKEN env (no refresh)
 *   2. macOS Keychain + IDE state.vscdb concurrently
 *   3. Prefer a still-valid local access token (Keychain first, then vscdb)
 *      with zero network
 *   4. Else refresh Keychain; if that fails and vscdb refresh differs, refresh vscdb
 *
 * Never scan sibling OS profiles. WSL uses only the current Windows user.
 * Adapted from MIT Rahularya01/pi-cursor src/auth/cli-credentials.ts — not copied.
 */
import { execFile } from 'node:child_process';
export declare const CURSOR_IMPORT_EMPTY = "cursor-import-empty";
/** Windows account that owns this WSL session — never Public / Default / others. */
export declare function windowsUsernameFromEnv(env?: NodeJS.ProcessEnv): string;
export declare function cursorVscdbPaths({ platform, env, home }?: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    home?: string;
}): any[];
declare function defaultReadVscdb(dbPath: any): Promise<{
    accessToken?: undefined;
    refreshToken?: undefined;
    cachedEmail?: undefined;
} | {
    accessToken: any;
    refreshToken: any;
    cachedEmail: any;
}>;
export declare function readCursorVscdbTokens({ platform, env, home, paths, readDb, now, }?: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    home?: string;
    readDb?: typeof defaultReadVscdb;
    now?: number;
}): Promise<{}>;
export declare function readCursorKeychainTokens({ platform, execFileFn, }?: {
    platform?: NodeJS.Platform;
    execFileFn?: typeof execFile.__promisify__;
}): Promise<{}>;
export declare function resolveCursorLocalCredentials({ fetchFn, env, platform, home, execFileFn, readVscdbFn, now, }?: {
    fetchFn?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    home?: string;
    execFileFn?: typeof execFile.__promisify__;
    now?: number;
}): Promise<{
    planType?: any;
    source: string;
    account?: string;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
}>;
export declare function importCursorAuth(options?: {}): Promise<{
    source: string;
    session: {
        planType?: any;
        source: string;
        account?: string;
        accessToken: any;
        refreshToken: any;
        expiresAt: number;
    };
}>;
export {};
