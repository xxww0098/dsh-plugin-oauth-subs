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
export declare function windowsUsernameFromEnv(env?: NodeJS.ProcessEnv): string | undefined;
export declare function cursorVscdbPaths({ platform, env, home }?: {
    platform?: NodeJS.Platform | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    home?: string | undefined;
}): any[];
export declare function readCursorVscdbTokens({ platform, env, home, paths, readDb, now, }?: any): Promise<any>;
export declare function readCursorKeychainTokens({ platform, execFileFn, }?: {
    platform?: NodeJS.Platform | undefined;
    execFileFn?: typeof execFile.__promisify__ | undefined;
}): Promise<any>;
export declare function resolveCursorLocalCredentials({ fetchFn, env, platform, home, execFileFn, readVscdbFn, now, }?: any): Promise<{
    cachedEmail?: string | undefined;
    planType?: any;
    source: any;
    account?: string | undefined;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
} | undefined>;
export declare function importCursorAuth(options?: any): Promise<{
    source: any;
    session: {
        cachedEmail?: string | undefined;
        planType?: any;
        source: any;
        account?: string | undefined;
        accessToken: any;
        refreshToken: any;
        expiresAt: number;
    };
}>;
