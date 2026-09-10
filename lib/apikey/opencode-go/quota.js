/**
 * OpenCode Go remaining quota from the web dashboard (cookie + workspace).
 *
 * Not GET /zen/go/v1/usage with Bearer - that is CodexBar's API-key path.
 * Orca's two fields scrape https://opencode.ai/workspace/{wrk_}/go.
 */
import { randomUUID } from 'node:crypto';
import { normalizeOpencodeGoWorkspaceId } from './index.js';
export const OPENCODE_GO_ORIGIN = 'https://opencode.ai';
export const OPENCODE_GO_WORKSPACES_SERVER_ID = 'def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f';
export const OPENCODE_GO_QUOTA_TIMEOUT_MS = 10_000;
export const OPENCODE_GO_PAGE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const WORKSPACE_JS_RE = /id\s*:\s*"((?:wrk_)[^"]+)"/g;
const WORKSPACE_SCAN_RE = /wrk_[A-Za-z0-9]+/g;
function clampPct(value) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n))
        return undefined;
    return Math.max(0, Math.min(100, Math.round(n)));
}
function looksSignedOut(text) {
    const lower = String(text ?? '').toLowerCase();
    return lower.includes('login')
        || lower.includes('sign in')
        || lower.includes('auth/authorize')
        || lower.includes('not associated with an account')
        || lower.includes('actor of type "public"');
}
function extractNumber(pattern, text) {
    const match = String(text ?? '').match(pattern);
    if (!match)
        return undefined;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : undefined;
}
function pickWorkspaceIds(text) {
    const ids = [];
    const seen = new Set();
    const add = (value) => {
        const id = normalizeOpencodeGoWorkspaceId(value);
        if (!id || seen.has(id))
            return;
        seen.add(id);
        ids.push(id);
    };
    for (const match of String(text ?? '').matchAll(WORKSPACE_JS_RE))
        add(match[1]);
    try {
        const parsed = JSON.parse(text);
        const walk = (value) => {
            if (typeof value === 'string')
                add(value);
            else if (Array.isArray(value))
                value.forEach(walk);
            else if (value && typeof value === 'object')
                Object.values(value).forEach(walk);
        };
        walk(parsed);
    }
    catch {
        // HTML / serialized JS payload
    }
    if (ids.length === 0) {
        for (const match of String(text ?? '').matchAll(WORKSPACE_SCAN_RE))
            add(match[0]);
    }
    return ids;
}
function usageBag(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const used = clampPct(value.usagePercent
        ?? value.usedPercent
        ?? value.percentUsed
        ?? value.percent
        ?? value.usage_percent
        ?? value.used_percent);
    const rawReset = value.resetInSec
        ?? value.resetInSeconds
        ?? value.reset_in_sec
        ?? value.resetsInSec
        ?? value.resetIn;
    const resetInSec = Number(rawReset);
    return {
        usedPercent: used,
        resetInSec: Number.isFinite(resetInSec) ? resetInSec : undefined,
    };
}
function nestedUsage(root) {
    if (!root || typeof root !== 'object')
        return undefined;
    const usage = root.usage ?? root.data ?? root.result ?? root;
    const rolling = usage.rolling ?? usage.rollingUsage ?? root.rollingUsage;
    const weekly = usage.weekly ?? usage.weeklyUsage ?? root.weeklyUsage;
    const monthly = usage.monthly ?? usage.monthlyUsage ?? root.monthlyUsage;
    if (!rolling && !weekly && !monthly)
        return undefined;
    return { rolling: usageBag(rolling), weekly: usageBag(weekly), monthly: usageBag(monthly) };
}
function windowRow(kind, bag, now) {
    if (!bag || bag.usedPercent === undefined)
        return undefined;
    const resetAt = typeof bag.resetInSec === 'number' && bag.resetInSec >= 0
        ? now + bag.resetInSec * 1000
        : undefined;
    const windowMinutes = kind === 'primary' ? 300 : kind === 'weekly' ? 7 * 24 * 60 : undefined;
    return {
        key: kind,
        kind,
        usedPercent: bag.usedPercent,
        remainingPercent: 100 - bag.usedPercent,
        windowMinutes,
        resetAt,
    };
}
export function parseOpencodeGoUsage(text, now = Date.now()) {
    let bags;
    try {
        bags = nestedUsage(JSON.parse(text));
    }
    catch {
        bags = undefined;
    }
    if (!bags) {
        const rollingUsed = clampPct(extractNumber(/rollingUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/, text));
        const rollingReset = extractNumber(/rollingUsage[^}]*?resetInSec\s*:\s*([0-9]+)/, text);
        if (rollingUsed === undefined)
            throw new Error('Missing usage fields.');
        bags = {
            rolling: { usedPercent: rollingUsed, resetInSec: rollingReset },
            weekly: {
                usedPercent: clampPct(extractNumber(/weeklyUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/, text)),
                resetInSec: extractNumber(/weeklyUsage[^}]*?resetInSec\s*:\s*([0-9]+)/, text),
            },
            monthly: {
                usedPercent: clampPct(extractNumber(/monthlyUsage[^}]*?usagePercent\s*:\s*([0-9]+(?:\.[0-9]+)?)/, text)),
                resetInSec: extractNumber(/monthlyUsage[^}]*?resetInSec\s*:\s*([0-9]+)/, text),
            },
        };
    }
    if (!bags.rolling || bags.rolling.usedPercent === undefined)
        throw new Error('Missing usage fields.');
    return {
        rows: [
            windowRow('primary', bags.rolling, now),
            windowRow('weekly', bags.weekly, now),
            windowRow('monthly', bags.monthly, now),
        ].filter(Boolean),
    };
}
async function readBody(response) {
    const text = await response.text();
    if (looksSignedOut(text) || response.status === 401 || response.status === 403) {
        throw new Error('OpenCode Go cookie is invalid or expired');
    }
    if (!response.ok)
        throw new Error('OpenCode Go usage HTTP ' + response.status);
    return text;
}
async function fetchServerText({ cookieHeader, method, args, fetchFn, signal }) {
    const query = method === 'GET'
        ? '?id=' + encodeURIComponent(OPENCODE_GO_WORKSPACES_SERVER_ID)
            + (args ? '&args=' + encodeURIComponent(args) : '')
        : '';
    const headers = {
        Cookie: cookieHeader,
        'X-Server-Id': OPENCODE_GO_WORKSPACES_SERVER_ID,
        'X-Server-Instance': 'server-fn:' + randomUUID(),
        'User-Agent': OPENCODE_GO_PAGE_UA,
        Origin: OPENCODE_GO_ORIGIN,
        Referer: OPENCODE_GO_ORIGIN + '/',
        Accept: 'text/javascript, application/json;q=0.9, */*;q=0.8',
    };
    const init = { method, headers, signal, redirect: 'manual' };
    if (method !== 'GET') {
        init.body = args ?? '[]';
        headers['Content-Type'] = 'application/json';
    }
    const response = await fetchFn(OPENCODE_GO_ORIGIN + '/_server' + query, init);
    return readBody(response);
}
export async function fetchOpencodeGoWorkspaceId(cookieHeader, { fetchFn = fetch, signal } = {}) {
    const first = await fetchServerText({ cookieHeader, method: 'GET', fetchFn, signal });
    let ids = pickWorkspaceIds(first);
    if (ids.length === 0) {
        const fallback = await fetchServerText({ cookieHeader, method: 'POST', args: '[]', fetchFn, signal });
        ids = pickWorkspaceIds(fallback);
    }
    if (ids.length === 0)
        throw new Error('Missing workspace id.');
    return ids[0];
}
export async function fetchOpencodeGoQuota(entry, options = {}) {
    const fetchFn = options.fetchFn ?? fetch;
    const now = options.now ?? Date.now();
    const timeoutMs = options.timeoutMs ?? OPENCODE_GO_QUOTA_TIMEOUT_MS;
    const cookieHeader = String(entry?.cookieHeader ?? '').trim();
    if (!cookieHeader)
        throw new Error('OpenCode Go cookie is missing');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const workspaceId = normalizeOpencodeGoWorkspaceId(entry?.workspaceId)
            ?? await fetchOpencodeGoWorkspaceId(cookieHeader, { fetchFn, signal: ac.signal });
        const response = await fetchFn(OPENCODE_GO_ORIGIN + '/workspace/' + encodeURIComponent(workspaceId) + '/go', {
            method: 'GET',
            headers: {
                Cookie: cookieHeader,
                'User-Agent': OPENCODE_GO_PAGE_UA,
                Origin: OPENCODE_GO_ORIGIN,
                Referer: OPENCODE_GO_ORIGIN + '/',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: ac.signal,
            redirect: 'manual',
        });
        const text = await readBody(response);
        return { ...parseOpencodeGoUsage(text, now), workspaceId };
    }
    finally {
        clearTimeout(timer);
    }
}
