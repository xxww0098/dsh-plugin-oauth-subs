/**
 * Model usage for the 用量 tab, read from what DSH already writes: the
 * `usage` on every `assistant/message` in the session files. The proxy
 * records nothing, so the request path pays nothing.
 *
 * The scan runs in a worker thread (this same module) so decoding hundreds of
 * MB of zstd never blocks the proxy's event loop. Each file's hourly rows are
 * cached by mtime + size in `usage-cache.json`; a repeat open re-reads only
 * the sessions that changed since.
 */
/**
 * [hour epoch, provider, model, calls, input, output, cacheRead, cacheWrite,
 *  failed, cachePrompt, timed, ttftMs, decodeMs, decodeOut]
 * `failed`: attempts that failed and were not retried. `cachePrompt`: input +
 * cacheRead of the calls whose usage carries a cache field (Kiro's never
 * does), the hit-rate denominator. `timed`/`ttftMs`: calls with a step start
 * and stream times, and their summed wait for the first frame; `decodeMs`/
 * `decodeOut`: first-to-last frame time and the output written over it.
 */
type UsageRow = [number, string, string, number, number, number, number, number, number, number, number, number, number, number];
type FileEntry = {
    mtimeMs: number;
    size: number;
    id: string;
    version: number;
    rows: UsageRow[];
};
/**
 * One session file → hourly rows per provider/model. Only the head and the
 * few small event types above are JSON-parsed; tool output, system prompts
 * and chunk runs (most of the bytes) are skipped by their type prefix.
 * Failure and retry bookkeeping mirrors analyze-session's `sessionRecords`.
 */
export declare function scanSessionText(text: string, fallbackId: string): {
    id: string;
    version: number;
    rows: UsageRow[];
};
/**
 * Every session under `root` touched since `since` → merged hourly rows at or
 * after `since`. The same session may exist as v3 and v4 copies; only the
 * highest version counts. Returns the refreshed cache alongside.
 */
export declare function scanUsage(root: string, since: number, cache?: Record<string, FileEntry>, statFile?: typeof statSize): {
    rows: UsageRow[];
    files: Record<string, FileEntry>;
};
declare function statSize(path: string): {
    mtimeMs: number;
    size: number;
} | undefined;
/**
 * Hourly usage rows since `days` ago, scanned off-thread. Concurrent callers
 * share one scan. ponytail: a worker per request (~30 ms start); keep one
 * alive only if the tab ever polls.
 */
export declare function readUsage({ root, cachePath, days, now }: {
    root: string;
    cachePath: string;
    days?: number;
    now?: number;
}): Promise<UsageRow[]>;
export {};
