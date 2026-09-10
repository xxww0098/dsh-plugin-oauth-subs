/**
 * OpenCode Go remaining quota from the web dashboard (cookie + workspace).
 *
 * Not GET /zen/go/v1/usage with Bearer - that is CodexBar's API-key path.
 * Orca's two fields scrape https://opencode.ai/workspace/{wrk_}/go.
 */
export declare const OPENCODE_GO_ORIGIN = "https://opencode.ai";
export declare const OPENCODE_GO_WORKSPACES_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
export declare const OPENCODE_GO_QUOTA_TIMEOUT_MS = 10000;
export declare const OPENCODE_GO_PAGE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
export declare function parseOpencodeGoUsage(text: any, now?: number): {
    rows: {
        key: any;
        kind: any;
        usedPercent: any;
        remainingPercent: number;
        windowMinutes: number;
        resetAt: any;
    }[];
};
export declare function fetchOpencodeGoWorkspaceId(cookieHeader: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<any>;
export declare function fetchOpencodeGoQuota(entry: any, options?: {}): Promise<{
    workspaceId: any;
    rows: {
        key: any;
        kind: any;
        usedPercent: any;
        remainingPercent: number;
        windowMinutes: number;
        resetAt: any;
    }[];
}>;
