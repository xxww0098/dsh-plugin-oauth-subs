/**
 * Anthropic subscription quota.
 *
 * Claude Code exposes the unified 5-hour / weekly meters as rate-limit headers
 * on Messages responses. Its OAuth usage endpoint additionally reports scoped
 * weekly limits (for example, the separate Fable meter). Keep the tiny Messages
 * probe as the source for the established bars and use GET /api/oauth/usage to
 * enrich them with any model-scoped rows; if either endpoint is unavailable,
 * the other can still provide useful quota data.
 */
export declare function parseAnthropicUsage(payload: any): {
    rows: any[];
};
export declare function parseAnthropicRateLimitHeaders(headers: any): {
    rows: ({
        resetAt?: number | undefined;
        key: string;
        kind: any;
        label: any;
        usedPercent: number;
        remainingPercent: number;
    } | {
        key: string;
        product: string;
        resetAt?: number | undefined;
        kind: any;
        label: any;
        usedPercent: number;
        remainingPercent: number;
    } | undefined)[];
};
export declare function fetchAnthropicQuota(session: any, fetchFn?: typeof fetch, previousRows?: any): Promise<{
    planType: any;
    account: any;
    subscriptionStatus: string;
    rows: any[];
}>;
