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
import { gunzipSync } from 'node:zlib';
import { describeError } from './http.js';
import { outboundFetch } from './outbound.js';
import { readPrivateText, writePrivateText } from './private-text.js';
export const ARENA_LEADERBOARD_URL = 'https://arena.ai/leaderboard/agent';
export const ARENA_CACHE_FILE = 'arena-cache.json';
// An hour keeps repeat opens free; the upstream snapshot supplies its own date.
export const ARENA_TTL_MS = 60 * 60_000;
/** Category id → route suffix, in the site's own rail order. */
export const ARENA_CATEGORIES = [
    { id: 'overall', path: '' },
    { id: 'code', path: '/code' },
    { id: 'chat', path: '/chat' },
    { id: 'work', path: '/work' },
];
// These request the RSC representation; a browser UA alone cannot pass a challenge.
const ARENA_HEADERS = {
    'RSC': '1',
    'accept': 'text/x-component',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};
// Plain Node requests cannot execute the challenge. Explicit browser verification
// uses a plugin-owned Chrome; ordinary reads retain the public archive fallback.
const ARENA_ARCHIVE_WEB = 'https://web.archive.org/web';
const ARENA_ARCHIVE_CDX = 'https://web.archive.org/cdx/search/cdx';
/**
 * Cloudflare marks a gated route with 403 + `cf-mitigated: challenge`. Named
 * so a refresh can say the upstream gated it instead of printing a bare 403.
 */
export function isArenaChallenge(response) {
    return response.status === 403 && response.headers?.get('cf-mitigated') === 'challenge';
}
/** A failed category because the upstream challenged this client. */
export class ArenaChallengeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ArenaChallengeError';
    }
}
// The five signal columns, in the site's own columnOrder
// (signal:task_outcome_explicit … signal:tool_hallucination). The bash signal
// was renamed on 2026-10-13: `bash_recovery_steps` → `bash_reliability_no_prereq`
// ("Bash Reliability", weight 0.5), so a payload carrying the old key leaves
// that column empty.
const SIGNALS = [
    ['task_outcome_explicit', 'success', 'successCi'],
    ['praise_complaint', 'praise', 'praiseCi'],
    ['steering_burden', 'steer', 'steerCi'],
    ['bash_reliability_no_prereq', 'bash', 'bashCi'],
    ['tool_hallucination', 'halluc', 'hallucCi'],
];
/**
 * The site's own usability gate, read off its chunk `0pxzy916nkaqk.js`:
 * `costPerTaskForContender` returns null unless the contender has
 * `pricedSampleCount / totalSampleCount >= 0.5` **and** `pricedSampleCount
 * >= 50`; `tokensPerTaskForContender` needs the same half-sample share over
 * `tokenedSampleCount` (no absolute floor). A gated column renders N/A and
 * the row cannot place on the Pareto chart — the site's `pricedEntries` is
 * built from the same getter.
 */
function sampleShare(part, total) {
    const p = num(part);
    const t = num(total);
    return p !== null && t !== null && t > 0 && p / t >= 0.5;
}
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
        const costUsable = sampleShare(cost?.pricedSampleCount, cost?.totalSampleCount) && (num(cost?.pricedSampleCount) ?? 0) >= 50;
        const tokens = cost?.outputMtokPerTask;
        const tokensUsable = sampleShare(tokens?.tokenedSampleCount, tokens?.totalSampleCount);
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
            overallRank: num(raw?.overallRank),
            observations: num(raw?.observations),
            costUsd: costUsable ? num(cost?.medianUsd) : null,
            costUsd25: costUsable ? num(cost?.p25Usd) : null,
            costUsd95: costUsable ? num(cost?.p95Usd) : null,
            tokensM: tokensUsable ? num(tokens?.medianMtok) : null,
            tokensM25: tokensUsable ? num(tokens?.p25Mtok) : null,
            tokensM95: tokensUsable ? num(tokens?.p95Mtok) : null,
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
/**
 * Collect the RSC flight stream an archived (or saved) HTML document carries
 * inline: every `self.__next_f.push([1,"…"])` chunk is a JSON string literal,
 * so each parses back to raw flight text and the parts join in order. A torn
 * tail (a capture cut mid-script) skips; the next push still parses.
 */
export function extractFlightTextFromHtml(html) {
    const parts = [];
    const pushes = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    for (let match; (match = pushes.exec(html));) {
        try {
            parts.push(JSON.parse(match[1]));
        }
        catch {
            // not a JSON string after all; leave it out
        }
    }
    return parts.join('');
}
/** The newest `statuscode: 200` capture timestamp in a CDX JSON reply, if any. */
export function newestWaybackCapture(cdxJson) {
    let rows;
    try {
        rows = JSON.parse(cdxJson);
    }
    catch {
        return undefined;
    }
    if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(rows[0]))
        return undefined;
    const head = rows[0];
    const at = head.indexOf('timestamp');
    const code = head.indexOf('statuscode');
    let best;
    for (const row of rows.slice(1)) {
        if (!Array.isArray(row))
            continue;
        const stamp = at >= 0 ? String(row[at]) : '';
        if (!/^\d{14}$/.test(stamp))
            continue;
        if (code >= 0 && String(row[code]) !== '200')
            continue;
        if (best === undefined || stamp > best)
            best = stamp;
    }
    return best;
}
/**
 * One category's board out of the Wayback Machine: CDX names the newest 200
 * capture, then `id_` replay returns the capture's original bytes — gzip-coded
 * with no `Content-Encoding` header to match, so the magic bytes decide
 * whether to inflate. The archived document embeds the flight payload in
 * `__next_f` pushes; `extractFlightTextFromHtml` rejoins them for
 * `parseArenaBoard`.
 */
async function fetchWaybackBoard(path, fetchImpl) {
    const label = path || '/overall';
    const site = `${ARENA_LEADERBOARD_URL}${path}`;
    const cdx = await fetchImpl(`${ARENA_ARCHIVE_CDX}?url=${site.replace('https://', '')}&output=json&filter=statuscode:200&limit=-8`, {
        signal: AbortSignal.timeout(20_000),
    });
    if (!cdx.ok)
        throw new Error(`arena archive ${label}: CDX HTTP ${cdx.status}`);
    const stamp = newestWaybackCapture(await cdx.text());
    if (!stamp)
        throw new Error(`arena archive ${label}: no capture`);
    const capture = await fetchImpl(`${ARENA_ARCHIVE_WEB}/${stamp}id_/${site}`, {
        signal: AbortSignal.timeout(30_000),
    });
    if (!capture.ok)
        throw new Error(`arena archive ${label}: HTTP ${capture.status}`);
    let bytes = typeof capture.arrayBuffer === 'function'
        ? new Uint8Array(await capture.arrayBuffer())
        : new TextEncoder().encode(await capture.text());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b)
        bytes = new Uint8Array(gunzipSync(Buffer.from(bytes)));
    const flightText = extractFlightTextFromHtml(new TextDecoder().decode(bytes));
    if (!flightText)
        throw new Error(`arena archive ${label}: flight payload missing`);
    return parseArenaBoard(flightText);
}
async function fetchDirectBoard(path, fetchImpl) {
    const response = await fetchImpl(`${ARENA_LEADERBOARD_URL}${path}?_rsc=1`, {
        headers: ARENA_HEADERS,
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
        const label = path || '/overall';
        if (isArenaChallenge(response))
            throw new ArenaChallengeError(`arena ${label}: HTTP ${response.status} (Cloudflare challenge)`);
        throw new Error(`arena ${label}: HTTP ${response.status}`);
    }
    return parseArenaBoard(await response.text());
}
/** One category's board, direct when the site allows it, archived when gated. */
async function fetchArenaBoard(path, fetchImpl, previousUpdated) {
    try {
        return { board: await fetchDirectBoard(path, fetchImpl), archive: false };
    }
    catch (error) {
        if (!(error instanceof ArenaChallengeError))
            throw error;
        // Only a challenge falls through: the archive is the gated client's road
        // to a fresh board, but it must beat the snapshot the cache already
        // holds — an older capture (the site freezes snapshots for days at a
        // time) keeps the cache and reports the challenge instead of silently
        // regressing the tab.
        try {
            const board = await fetchWaybackBoard(path, fetchImpl);
            if (previousUpdated && board.lastUpdated <= previousUpdated)
                throw error;
            return { board, archive: true };
        }
        catch {
            throw error;
        }
    }
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
    return {
        at: raw.at,
        boards,
        ...(typeof raw.error === 'string' && raw.error ? { error: raw.error } : {}),
        ...(raw.blocked === true ? { blocked: true } : {}),
        ...(raw.archived === true ? { archived: true } : {}),
    };
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
export function createArenaSource({ cachePath, fetchImpl = outboundFetch, ttlMs = ARENA_TTL_MS, now = Date.now, browserFetch, }) {
    let inflight;
    let browserTask;
    let browserAbort;
    let browserState = { busy: false };
    let disposed = false;
    const refresh = async () => {
        const previous = await readArenaCache(cachePath);
        const settled = await Promise.allSettled(ARENA_CATEGORIES.map(async (category) => [category.id, await fetchArenaBoard(category.path, fetchImpl, previous?.boards[category.id]?.lastUpdated ?? '')]));
        const boards = { ...previous?.boards };
        const failed = [];
        let challenged = 0;
        let rescued = 0;
        for (const result of settled) {
            if (result.status === 'fulfilled') {
                boards[result.value[0]] = result.value[1].board;
                if (result.value[1].archive)
                    rescued += 1;
            }
            else {
                failed.push(describeError(result.reason));
                if (result.reason instanceof ArenaChallengeError)
                    challenged += 1;
            }
        }
        if (Object.keys(boards).length === 0) {
            throw new Error(failed[0] ?? 'arena refresh failed');
        }
        // Every category gated with nothing rescued: name the upstream block
        // instead of blaming one category's HTTP status. A rescue flips the answer
        // to `archived` — the boards are fresh, just archive-fresh.
        const blocked = challenged > 0 && challenged === settled.length && rescued === 0;
        const answer = {
            at: now(),
            boards,
            ...(failed.length > 0 ? { error: failed[0] } : {}),
            ...(blocked ? { blocked: true } : {}),
            ...(rescued > 0 && !blocked ? { archived: true } : {}),
        };
        await writePrivateText(cachePath, JSON.stringify(answer) + '\n').catch(() => { });
        return answer;
    };
    return {
        async read(fresh = false) {
            if (browserTask)
                return browserTask;
            if (!fresh && !inflight) {
                const cached = await readArenaCache(cachePath);
                if (browserTask)
                    return browserTask;
                if (cached && now() - cached.at < ttlMs)
                    return cached;
            }
            inflight ??= refresh().finally(() => { inflight = undefined; });
            return inflight;
        },
        browser(action) {
            if (action === 'cancel')
                browserAbort?.abort();
            if (action !== 'start' || browserTask)
                return browserState;
            if (disposed || !browserFetch)
                return { busy: false, error: 'Browser verification is unavailable.' };
            const abort = new AbortController();
            browserAbort = abort;
            browserState = { busy: true };
            const task = (async () => {
                const boards = await browserFetch(abort.signal);
                // Let a refresh already running finish before committing the browser result.
                await inflight?.catch(() => { });
                abort.signal.throwIfAborted();
                const previous = await readArenaCache(cachePath);
                for (const { id } of ARENA_CATEGORIES) {
                    const board = boards[id];
                    const date = Date.parse(board?.lastUpdated);
                    if (!board || !Array.isArray(board.rows) || !board.rows.length || !Number.isFinite(date)) {
                        throw new Error('Chrome returned an incomplete ' + id + ' board. The cached snapshot was kept.');
                    }
                    if (date < Date.parse(previous?.boards[id]?.lastUpdated ?? '')) {
                        throw new Error('Chrome returned an older ' + id + ' snapshot. The cached snapshot was kept.');
                    }
                }
                abort.signal.throwIfAborted();
                const answer = { at: now(), boards };
                await writePrivateText(cachePath, JSON.stringify(answer) + '\n');
                return answer;
            })();
            browserTask = task;
            void task.then(answer => { browserState = { busy: false, answer }; }, error => { browserState = { busy: false, ...(abort.signal.aborted ? { cancelled: true } : { error: describeError(error) }) }; }).finally(() => { browserTask = undefined; browserAbort = undefined; });
            return browserState;
        },
        dispose() {
            disposed = true;
            browserAbort?.abort();
        },
    };
}
