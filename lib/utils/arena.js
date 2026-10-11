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
import { describeError } from './http.js';
import { outboundFetch } from './outbound.js';
import { readPrivateText, writePrivateText } from './private-text.js';
export const ARENA_LEADERBOARD_URL = 'https://arena.ai/leaderboard/agent';
export const ARENA_CACHE_FILE = 'arena-cache.json';
// The upstream snapshot moves once a day at 12:00 UTC; an hour keeps repeat
// opens free while never lagging a daily refresh by more than the TTL.
export const ARENA_TTL_MS = 60 * 60_000;
/** Category id → route suffix, in the site's own rail order. */
export const ARENA_CATEGORIES = [
    { id: 'overall', path: '' },
    { id: 'code', path: '/code' },
    { id: 'chat', path: '/chat' },
    { id: 'work', path: '/work' },
];
// Cloudflare fronts the site and answers a bare `node` UA with the challenge
// page; a browser UA gets the payload (verified with curl, no cookies).
const ARENA_HEADERS = {
    'RSC': '1',
    'accept': 'text/x-component',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};
const SIGNALS = [
    ['task_outcome_explicit', 'success', 'successCi'],
    ['praise_complaint', 'praise', 'praiseCi'],
    ['steering_burden', 'steer', 'steerCi'],
    ['bash_recovery_steps', 'bash', 'bashCi'],
    ['tool_hallucination', 'halluc', 'hallucCi'],
];
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value) => (typeof value === 'string' ? value : '');
/** Balanced, string-aware extraction of `"key":{…}` from a flight payload. */
export function extractFlightObject(text, key) {
    const marker = `"${key}":`;
    const at = text.indexOf(marker);
    if (at < 0)
        return undefined;
    const start = text.indexOf('{', at + marker.length);
    if (start < 0)
        return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (ch === '\\')
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"')
            inString = true;
        else if (ch === '{')
            depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(text.slice(start, i + 1));
                }
                catch {
                    return undefined;
                }
            }
        }
    }
    return undefined;
}
/** Map one category's flight payload onto the panel's board shape. */
export function parseArenaBoard(text) {
    const snapshot = extractFlightObject(text, 'snapshot');
    if (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length === 0) {
        throw new Error('arena payload: snapshot rows missing');
    }
    const costs = extractFlightObject(text, 'costStats');
    const costByContender = new Map();
    for (const entry of Array.isArray(costs?.entries) ? costs.entries : []) {
        if (entry && typeof entry.contenderName === 'string')
            costByContender.set(entry.contenderName, entry);
    }
    const rows = snapshot.rows.map((raw, index) => {
        const signals = raw?.signalScores ?? {};
        const signalCi = raw?.signalCi ?? {};
        const cost = costByContender.get(raw?.contenderName);
        const row = {
            rank: typeof raw?.rank === 'number' ? raw.rank : index + 1,
            model: str(raw?.model),
            org: str(raw?.modelOrganization),
            license: str(raw?.license),
            url: str(raw?.modelUrl),
            priceIn: num(raw?.inputPricePerMillion),
            priceOut: num(raw?.outputPricePerMillion),
            spreadMin: typeof raw?.rankSpread?.min === 'number' ? raw.rankSpread.min : 0,
            spreadMax: typeof raw?.rankSpread?.max === 'number' ? raw.rankSpread.max : 0,
            value: num(raw?.avgScore?.value) ?? 0,
            ci: num(raw?.avgScore?.ci) ?? 0,
            sessions: num(raw?.sessions) ?? 0,
            costUsd: num(cost?.medianUsd),
            costUsd25: num(cost?.p25Usd),
            costUsd95: num(cost?.p95Usd),
            tokensM: num(cost?.outputMtokPerTask?.medianMtok),
            tokensM25: num(cost?.outputMtokPerTask?.p25Mtok),
            tokensM95: num(cost?.outputMtokPerTask?.p95Mtok),
        };
        for (const [source, valueKey, ciKey] of SIGNALS) {
            row[valueKey] = num(signals[source]);
            row[ciKey] = num(signalCi[source]);
        }
        return row;
    });
    return {
        lastUpdated: str(snapshot.lastUpdated),
        totalSessions: num(snapshot.totalSessions) ?? 0,
        modelCount: num(snapshot.modelCount) ?? rows.length,
        rows,
    };
}
async function fetchArenaBoard(path, fetchImpl) {
    const response = await fetchImpl(`${ARENA_LEADERBOARD_URL}${path}?_rsc=1`, {
        headers: ARENA_HEADERS,
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
        throw new Error(`arena ${path || '/overall'}: HTTP ${response.status}`);
    return parseArenaBoard(await response.text());
}
function normalizeAnswer(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.at !== 'number' || !raw.boards)
        return undefined;
    const boards = {};
    for (const [id, board] of Object.entries(raw.boards)) {
        const candidate = board;
        if (!candidate || !Array.isArray(candidate.rows))
            continue;
        boards[id] = {
            lastUpdated: str(candidate.lastUpdated),
            totalSessions: num(candidate.totalSessions) ?? 0,
            modelCount: num(candidate.modelCount) ?? candidate.rows.length,
            rows: candidate.rows,
        };
    }
    if (Object.keys(boards).length === 0)
        return undefined;
    return { at: raw.at, boards, ...(typeof raw.error === 'string' && raw.error ? { error: raw.error } : {}) };
}
async function readArenaCache(path) {
    try {
        return normalizeAnswer(JSON.parse((await readPrivateText(path, 'oauth-subs arena cache')) ?? 'null'));
    }
    catch {
        return undefined;
    }
}
/**
 * One reader per plugin instance: file cache + TTL + in-flight dedupe, so a
 * burst of `arena` RPCs (tab open + 刷新 race) costs one upstream round.
 */
export function createArenaSource({ cachePath, fetchImpl = outboundFetch, ttlMs = ARENA_TTL_MS, now = Date.now, }) {
    let inflight;
    const refresh = async () => {
        const previous = await readArenaCache(cachePath);
        const settled = await Promise.allSettled(ARENA_CATEGORIES.map(async (category) => [category.id, await fetchArenaBoard(category.path, fetchImpl)]));
        const boards = { ...previous?.boards };
        const failed = [];
        for (const result of settled) {
            if (result.status === 'fulfilled')
                boards[result.value[0]] = result.value[1];
            else
                failed.push(describeError(result.reason));
        }
        if (Object.keys(boards).length === 0) {
            throw new Error(failed[0] ?? 'arena refresh failed');
        }
        const answer = {
            at: now(),
            boards,
            ...(failed.length > 0 ? { error: failed[0] } : {}),
        };
        await writePrivateText(cachePath, JSON.stringify(answer) + '\n').catch(() => { });
        return answer;
    };
    return {
        async read(fresh = false) {
            if (!fresh && !inflight) {
                const cached = await readArenaCache(cachePath);
                if (cached && now() - cached.at < ttlMs)
                    return cached;
            }
            inflight ??= refresh().finally(() => { inflight = undefined; });
            return inflight;
        },
    };
}
