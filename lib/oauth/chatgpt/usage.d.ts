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
/** The SSE event whose `data:` JSON carries `response.usage`. */
export declare const CHATGPT_USAGE_EVENT = "response.completed";
/** Mirrors Codex's window names; the values are local token sums. */
export interface ChatgptUsageSpend {
    model: string;
    input: number;
    cached: number;
    output: number;
    at?: number;
}
/**
 * `response.completed` → the spend it proves. Returns undefined for any other
 * shape or an all-zero usage block (a spend of nothing is not a reading), so
 * a noisy stream cannot inflate the windows.
 */
export declare function parseChatgptUsageEvent(data: any): ChatgptUsageSpend | undefined;
/** Where each completed response's spend is appended (dataDir wiring). */
export declare function setChatgptUsageLog(path: string | undefined): void;
/** Test seam: drop the configured path. */
export declare function resetChatgptUsageLog(): void;
/** Append one spend for `accountId` (the vault accountKey). Best-effort. */
export declare function recordChatgptUsage(accountId: string, spend: ChatgptUsageSpend, at?: number): Promise<void>;
/**
 * Rolling measured windows for one account: 5h and 7d sums of input+output
 * tokens (input already contains cached tokens on this wire). `total` stays
 * absent — the plan's own quota unit is not tokens, and inventing a
 * denominator would fake a percentage the meter could show.
 */
export declare function chatgptUsageRows(accountId: string, now?: number): Promise<{
    kind: string;
    key: string;
    unit: string;
    used: any;
    note: string;
}[]>;
