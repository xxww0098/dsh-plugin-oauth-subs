/**
 * Anthropic subscription quota.
 *
 * There is no usage endpoint behind the Claude OAuth token — senpi/pi-ai and
 * Claude Code itself read consumption reactively. What the subscription lane
 * does expose is the unified rate-limit telemetry on every Messages response
 * (200 and 429 alike):
 *
 *   anthropic-ratelimit-unified-5h-utilization   0..1 of the 5-hour window
 *   anthropic-ratelimit-unified-5h-reset         window reset timestamp
 *   anthropic-ratelimit-unified-7d-utilization   0..1 of the weekly window
 *   anthropic-ratelimit-unified-7d-reset         weekly reset timestamp
 *
 * (community-pinned from Claude Code usage trackers: pi-usage-limit-tracker,
 * @mtrojnar/pi-usage, oc-anthropic-multi-account). The fetcher therefore sends
 * a 1-token probe (`max_tokens: 1`, haiku) and reads the headers — the same
 * tiny-throttled-request practice those trackers use. A 429 is not an error:
 * an exhausted window still reports its utilization.
 */
export declare function parseAnthropicRateLimitHeaders(headers: any): {
    rows: ({
        resetAt?: number | undefined;
        key: string;
        kind: any;
        label: any;
        usedPercent: number;
        remainingPercent: number;
    } | undefined)[];
};
export declare function fetchAnthropicQuota(session: any, fetchFn?: typeof fetch): Promise<{
    rows: ({
        resetAt?: number | undefined;
        key: string;
        kind: any;
        label: any;
        usedPercent: number;
        remainingPercent: number;
    } | undefined)[];
    planType: any;
    account: any;
    subscriptionStatus: string;
}>;
