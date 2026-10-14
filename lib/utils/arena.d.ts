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
 *     five per-signal columns: task_outcome_explicit, praise_complaint,
 *     steering_burden, bash_reliability_no_prereq, tool_hallucination),
 *     sessions, observations, prices, license, modelUrl.
 *   - `costStats` — entries[] keyed by contenderName with the P50 columns
 *     (medianUsd cost/task, outputMtokPerTask.medianMtok tokens/task).
 *
 * Verified against the live page: the diverging mini-bar scale is
 * max(|value|+ci) per column, so the widest whisker exactly touches the
 * track edge (see ArenaPanel). Values are fractions (0.1433 → “14.33%”).
 *
 * Caching: the reader memoizes on a 1 h TTL in `arena-cache.json` (data dir) and the
 * page keeps the last answer in localStorage. A failed refresh falls back to
 * the stale boards instead of blanking the tab.
 *
 * 2026-10-14: the site's Cloudflare now answers `/` and every path carrying a
 * `leaderboard` segment with a managed challenge for non-browser clients, so
 * the whole board set can come back gated — the answer then carries `blocked`
 * and the tab says why (docs/error.md). A gated category is then retried
 * against the Wayback Machine's public archive, whose captures embed the same
 * flight payload in `self.__next_f.push([1,"…"])` chunks; a rescued round
 * carries `archived` instead, and never rolls a category back to an older
 * snapshot than the cache already holds.
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
    headers?: {
        get(name: string): string | null;
    };
    text: () => Promise<string>;
    /** Present on real fetch responses; archive reads prefer it to survive gzip. */
    arrayBuffer?: () => Promise<ArrayBuffer>;
}>;
/**
 * Cloudflare marks a gated route with 403 + `cf-mitigated: challenge`. Named
 * so a refresh can say the upstream gated it instead of printing a bare 403.
 */
export declare function isArenaChallenge(response: {
    status: number;
    headers?: {
        get(name: string): string | null;
    };
}): boolean;
/** A failed category because the upstream challenged this client. */
export declare class ArenaChallengeError extends Error {
    constructor(message: string);
}
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
    /** The site's second rank axis (hidden column by default; null in the payload). */
    overallRank: number | null;
    /** Raw observation count behind the row (the site keeps it off the table). */
    observations: number | null;
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
    /** Every category was challenged: nothing fresh, the upstream gated it all. */
    blocked?: boolean;
    /** At least one board this round came from the Wayback archive fallback. */
    archived?: boolean;
}
/** Balanced, string-aware extraction of `"key":{…}` from a flight payload. */
export declare function extractFlightObject(text: string, key: string): any;
/** Map one category's flight payload onto the panel's board shape. */
export declare function parseArenaBoard(text: string): ArenaBoard;
/**
 * Collect the RSC flight stream an archived (or saved) HTML document carries
 * inline: every `self.__next_f.push([1,"…"])` chunk is a JSON string literal,
 * so each parses back to raw flight text and the parts join in order. A torn
 * tail (a capture cut mid-script) skips; the next push still parses.
 */
export declare function extractFlightTextFromHtml(html: string): string;
/** The newest `statuscode: 200` capture timestamp in a CDX JSON reply, if any. */
export declare function newestWaybackCapture(cdxJson: string): string | undefined;
export interface ArenaSource {
    read(fresh?: boolean): Promise<ArenaAnswer>;
    browser(action: 'start' | 'status' | 'cancel'): ArenaBrowserState;
    dispose(): void;
}
export interface ArenaBrowserState {
    busy: boolean;
    answer?: ArenaAnswer;
    error?: string;
    cancelled?: boolean;
}
/**
 * One reader per plugin instance: file cache + TTL + in-flight dedupe, so a
 * burst of `arena` RPCs (tab open + 刷新 race) costs one upstream round.
 */
export declare function createArenaSource({ cachePath, fetchImpl, ttlMs, now, browserFetch, }: {
    cachePath: string;
    fetchImpl?: ArenaFetch;
    ttlMs?: number;
    now?: () => number;
    browserFetch?: (signal: AbortSignal) => Promise<Record<string, ArenaBoard>>;
}): ArenaSource;
