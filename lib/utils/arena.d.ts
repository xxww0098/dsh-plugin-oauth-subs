/**
 * arena.ai agent leaderboard reader for the 榜单 tab.
 *
 * The site is a Next.js app with no public JSON API: the board ships inside
 * the RSC flight payload of `GET /leaderboard/agent[/<category>]?_rsc=…`
 * (header `RSC: 1`, ~40 KB gzipped, no cookies). Inside that stream two
 * balanced-JSON objects carry everything the table shows:
 *
 *   - `snapshot` — lastUpdated / totalSessions / modelCount / rows[] with
 *     rank, rankSpread, avgScore{value,ci}, signalScores + signalCi (the
 *     five per-signal columns), sessions, prices, license, modelUrl.
 *   - `costStats` — entries[] keyed by contenderName with the P50 columns
 *     (medianUsd cost/task, outputMtokPerTask.medianMtok tokens/task).
 *
 * Verified against the live page: the diverging mini-bar scale is
 * max(|value|+ci) per column, so the widest whisker exactly touches the
 * track edge (see ArenaPanel). Values are fractions (0.1433 → “14.33%”).
 *
 * Caching: one snapshot a day (lastUpdated is a fixed 12:00 UTC stamp), so
 * the reader memoizes on a 1 h TTL in `arena-cache.json` (data dir) and the
 * page keeps the last answer in localStorage. A failed refresh falls back to
 * the stale boards instead of blanking the tab.
 */
export declare const ARENA_LEADERBOARD_URL = "https://arena.ai/leaderboard/agent";
export declare const ARENA_CACHE_FILE = "arena-cache.json";
export declare const ARENA_TTL_MS: number;
/** Category id → route suffix, in the site's own rail order. */
export declare const ARENA_CATEGORIES: readonly [{
    readonly id: "overall";
    readonly path: "";
}, {
    readonly id: "code";
    readonly path: "/code";
}, {
    readonly id: "chat";
    readonly path: "/chat";
}, {
    readonly id: "work";
    readonly path: "/work";
}];
export type ArenaFetch = (input: string, init?: Record<string, unknown>) => Promise<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
}>;
export interface ArenaRow {
    rank: number;
    model: string;
    org: string;
    license: string;
    url: string;
    priceIn: number | null;
    priceOut: number | null;
    spreadMin: number;
    spreadMax: number;
    /** Net improvement (avgScore.value) — fractions, displayed ×100. */
    value: number;
    ci: number;
    success: number | null;
    successCi: number | null;
    praise: number | null;
    praiseCi: number | null;
    steer: number | null;
    steerCi: number | null;
    bash: number | null;
    bashCi: number | null;
    /** Tool hallucination: positive raw rate renders Down (lower is better). */
    halluc: number | null;
    hallucCi: number | null;
    sessions: number;
    /** costStats median cost per task, USD. */
    costUsd: number | null;
    /** costStats p25 / p95 cost per task, USD — the site's task-length filter. */
    costUsd25: number | null;
    costUsd95: number | null;
    /** costStats median output tokens per task, in millions. */
    tokensM: number | null;
    /** costStats p25 / p95 output tokens per task, in millions. */
    tokensM25: number | null;
    tokensM95: number | null;
}
export interface ArenaBoard {
    lastUpdated: string;
    totalSessions: number;
    modelCount: number;
    rows: ArenaRow[];
}
export interface ArenaAnswer {
    at: number;
    boards: Record<string, ArenaBoard>;
    /** Present when the answer is (partly) a stale-cache fallback. */
    error?: string;
}
/** Balanced, string-aware extraction of `"key":{…}` from a flight payload. */
export declare function extractFlightObject(text: string, key: string): any;
/** Map one category's flight payload onto the panel's board shape. */
export declare function parseArenaBoard(text: string): ArenaBoard;
export interface ArenaSource {
    read(fresh?: boolean): Promise<ArenaAnswer>;
}
/**
 * One reader per plugin instance: file cache + TTL + in-flight dedupe, so a
 * burst of `arena` RPCs (tab open + 刷新 race) costs one upstream round.
 */
export declare function createArenaSource({ cachePath, fetchImpl, ttlMs, now, }: {
    cachePath: string;
    fetchImpl?: ArenaFetch;
    ttlMs?: number;
    now?: () => number;
}): ArenaSource;
