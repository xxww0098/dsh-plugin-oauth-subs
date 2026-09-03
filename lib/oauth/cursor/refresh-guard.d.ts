/**
 * Short in-process backoff for a Cursor refresh token that already failed.
 * A stale CLI Keychain entry must not stall every Settings snapshot.
 */
export declare function isCursorRefreshKnownBad(token: any, now?: number): boolean;
export declare function markCursorRefreshFailed(token: any, now?: number): void;
export declare function markCursorRefreshSucceeded(token: any): void;
export declare function resetCursorRefreshGuard(): void;
