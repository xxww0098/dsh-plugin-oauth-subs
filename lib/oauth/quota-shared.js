/**
 * Vendor-agnostic quota helpers shared by every family's `quota.ts`:
 * number / percent / timestamp coercion, credit-bag math, reset-credit
 * availability, and the timeout + JSON read around one quota fetch.
 */
export const QUOTA_TIMEOUT_MS = 10_000;
const USED_RESET_STATUS = new Set(['redeemed', 'used', 'consumed', 'expired']);
export function asNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const next = Number(value);
        if (Number.isFinite(next))
            return next;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('val' in value)
            return asNumber(value.val);
        if ('value' in value)
            return asNumber(value.value);
    }
    return undefined;
}
export function clampPct(value) {
    const n = asNumber(value);
    if (n === undefined)
        return undefined;
    return Math.max(0, Math.min(100, Math.round(n)));
}
export function creditBagAmounts(value) {
    if (Array.isArray(value)) {
        for (const item of value) {
            const bag = creditBagAmounts(item);
            if (bag)
                return bag;
        }
        return undefined;
    }
    if (!value || typeof value !== 'object')
        return undefined;
    const total = asNumber(value.total ?? value.limit ?? value.cap ?? value.allocation ?? value.amount);
    const used = asNumber(value.used ?? value.spent ?? value.consumed ?? value.usage);
    const remaining = asNumber(value.remaining ?? value.balance ?? value.left);
    if (total === undefined && used === undefined && remaining === undefined) {
        return creditBagAmounts(value.bags ?? value.items);
    }
    const resolvedUsed = used ?? (total !== undefined && remaining !== undefined ? Math.max(0, total - remaining) : undefined);
    const resolvedRemaining = remaining ?? (total !== undefined && resolvedUsed !== undefined ? Math.max(0, total - resolvedUsed) : undefined);
    return { used: resolvedUsed, total, remaining: resolvedRemaining };
}
export function creditBagUsedPercent(value) {
    const bag = creditBagAmounts(value);
    if (!bag || bag.total === undefined || bag.total <= 0 || bag.used === undefined)
        return undefined;
    return clampPct((bag.used / bag.total) * 100);
}
export function stampOf(value) {
    const n = asNumber(value);
    if (n !== undefined && n > 0)
        return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
export function resetAtOf(window) {
    const stamp = stampOf(window?.reset_at
        ?? window?.resetAt
        ?? window?.resets_at
        ?? window?.resetsAt
        ?? window?.reset_time
        ?? window?.resetTime);
    if (stamp !== undefined)
        return stamp;
    const after = asNumber(window?.reset_after_seconds
        ?? window?.resetAfterSeconds
        ?? window?.seconds_until_reset
        ?? window?.secondsUntilReset
        ?? window?.reset_after
        ?? window?.resetAfter);
    if (after !== undefined && after >= 0)
        return Date.now() + after * 1000;
    return undefined;
}
export function isAvailableResetCredit(credit) {
    if (!credit)
        return false;
    const status = (credit.status ?? 'available').trim().toLowerCase();
    if (USED_RESET_STATUS.has(status))
        return false;
    if (credit.expiresAt !== undefined)
        return credit.expiresAt > Date.now();
    return true;
}
export function timeoutSignal(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    if (typeof timer.unref === 'function')
        timer.unref();
    return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}
export function trimmedQuotaMsg(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
export async function readJson(response, label) {
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${label} failed (HTTP ${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`);
    }
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(`${label} returned non-JSON`);
    }
}
/**
 * One read's own quota budget: `run` gets the abort signal, cancelled whatever
 * it returns or throws. A read that inspects the response itself — a 403 region
 * fallback, a status-checked retry, a gRPC frame — is written around this; a
 * plain JSON read is `quotaJson`, and a family that reads several at once is
 * `quotaReads`.
 */
export async function withQuotaTimeout(run) {
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS);
    try {
        return await run(wait.signal);
    }
    finally {
        wait.cancel();
    }
}
/** One plain JSON read with the quota budget: the fetch, its timeout, and the vendor-named error of a failed or unparseable answer. */
export function quotaJson(fetchFn, { url, label, init = {} }) {
    return withQuotaTimeout(async (signal) => readJson(await fetchFn(url, { method: 'GET', ...init, signal }), label));
}
/**
 * Every read of one family's quota fetch at once, each with its own timeout
 * budget, as one settled result per read. A plain read is named, so the error
 * it fails with is the vendor's own ("codex usage failed (HTTP 500)").
 *
 * Nothing here decides what a failure means: a family names the reads it
 * cannot do without (`if (!usage.ok) throw usage.error`) exactly as it did
 * when the fetch was written out by hand. Codex reads a field of a payload
 * whose own step failed, so both the payload and the parsed value come back.
 */
export async function quotaReads(fetchFn, reads) {
    return Promise.all(reads.map(async (read) => {
        try {
            const raw = read.run ? await withQuotaTimeout(read.run) : await quotaJson(fetchFn, read);
            return { ok: true, raw, value: read.parse ? read.parse(raw) : raw };
        }
        catch (error) {
            return { ok: false, error };
        }
    }));
}
