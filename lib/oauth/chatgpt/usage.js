/**
 * Sign in with ChatGPT measured usage.
 *
 * This route has no quota endpoint: siwc forbids the token on
 * chatgpt.com/backend-api (so no wham/usage, no reset cards) and the
 * Responses answers carry no rate-limit headers or frames (2026-09-30 live
 * check, see README 额度). The only in-contract usage signal is the terminal
 * `response.completed` event's `usage` block (public Responses fields), so
 * the hop accumulates it per account into rolling windows — measured tokens,
 * not the plan's own quota unit. The official numbers stay one click away on
 * the card's 「管理用量」link.
 *
 * Do not reuse this helper for another family; Codex learns real windows from
 * its own `codex.rate_limits` frame.
 */
import { appendPrivateLine, readPrivateText } from '../../utils/private-text.js';
/** The SSE event whose `data:` JSON carries `response.usage`. */
export const CHATGPT_USAGE_EVENT = 'response.completed';
const PRIMARY_WINDOW_MS = 5 * 60 * 60 * 1000;
const WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * `response.completed` → the spend it proves. Returns undefined for any other
 * shape or an all-zero usage block (a spend of nothing is not a reading), so
 * a noisy stream cannot inflate the windows.
 */
export function parseChatgptUsageEvent(data) {
    const usage = data?.response?.usage;
    if (!usage || typeof usage !== 'object')
        return undefined;
    const input = usage.input_tokens;
    const output = usage.output_tokens;
    if (typeof input !== 'number' || !Number.isFinite(input))
        return undefined;
    if (typeof output !== 'number' || !Number.isFinite(output))
        return undefined;
    if (input <= 0 && output <= 0)
        return undefined;
    const cached = usage.input_tokens_details?.cached_tokens;
    const model = typeof data?.response?.model === 'string' && data.response.model ? data.response.model : '';
    return { model, input, cached: typeof cached === 'number' && Number.isFinite(cached) ? cached : 0, output };
}
let usageLog;
/** Where each completed response's spend is appended (dataDir wiring). */
export function setChatgptUsageLog(path) {
    usageLog = path;
}
/** Test seam: drop the configured path. */
export function resetChatgptUsageLog() {
    usageLog = undefined;
}
/** Append one spend for `accountId` (the vault accountKey). Best-effort. */
export async function recordChatgptUsage(accountId, spend, at = Date.now()) {
    if (typeof usageLog !== 'string' || !usageLog)
        return;
    const line = JSON.stringify({
        at: Math.round(at),
        account: typeof accountId === 'string' && accountId ? accountId : '',
        model: spend.model,
        input: spend.input,
        cached: spend.cached,
        output: spend.output,
    });
    await appendPrivateLine(usageLog, line).catch(() => { });
}
// The rotated `.1` still holds spends inside the weekly window; both files
// together are the window source. Reads re-parse each open — the log is tiny
// (one line per completed response) next to the session files the 用量 tab
// already scans.
async function readUsageLines() {
    if (typeof usageLog !== 'string' || !usageLog)
        return [];
    const rows = [];
    for (const path of [usageLog, `${usageLog}.1`]) {
        let text = '';
        try {
            text = (await readPrivateText(path, 'chatgpt usage log')) ?? '';
        }
        catch {
            continue;
        }
        for (const line of text.split('\n')) {
            if (!line)
                continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed && typeof parsed === 'object' && typeof parsed.at === 'number')
                    rows.push(parsed);
            }
            catch { /* a torn line is skipped, not fatal */ }
        }
    }
    rows.sort((a, b) => a.at - b.at);
    return rows;
}
function formatTokens(count) {
    if (count >= 1_000_000_000)
        return `${(count / 1_000_000_000).toFixed(1)}B`;
    if (count >= 1_000_000)
        return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000)
        return `${(count / 1_000).toFixed(0)}K`;
    return `${Math.round(count)}`;
}
/**
 * Rolling measured windows for one account: 5h and 7d sums of input+output
 * tokens (input already contains cached tokens on this wire). `total` stays
 * absent — the plan's own quota unit is not tokens, and inventing a
 * denominator would fake a percentage the meter could show.
 */
export async function chatgptUsageRows(accountId, now = Date.now()) {
    if (typeof accountId !== 'string' || !accountId.trim())
        return [];
    const mine = (await readUsageLines()).filter((line) => String(line.account) === accountId.trim());
    const inPrimary = mine.filter((line) => now - line.at < PRIMARY_WINDOW_MS);
    const inWeekly = mine.filter((line) => now - line.at < WEEKLY_WINDOW_MS);
    if (!inWeekly.length)
        return [];
    const sum = (lines) => lines.reduce((total, line) => total + (Number(line.input) || 0) + (Number(line.output) || 0), 0);
    return [
        {
            kind: 'primary',
            key: 'chatgpt-usage-primary',
            unit: 'tokens',
            used: sum(inPrimary),
            note: `近 5 小时实测 ${formatTokens(sum(inPrimary))} tokens（${inPrimary.length} 次调用）`,
        },
        {
            kind: 'weekly',
            key: 'chatgpt-usage-weekly',
            unit: 'tokens',
            used: sum(inWeekly),
            note: `近 7 天实测 ${formatTokens(sum(inWeekly))} tokens（${inWeekly.length} 次调用）；官方额度单位不是 token，以 ChatGPT 设置 → 用量为准`,
        },
    ];
}
