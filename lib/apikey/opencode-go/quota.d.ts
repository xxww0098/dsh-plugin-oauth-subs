/**
 * OpenCode Go remaining quota. Migrated workspaces live in the Console SPA:
 * cookie + `x-org-id` against `/console/api/{orgs,go/status,billing/status}`.
 * Unmigrated workspaces still serve the legacy `/_server` + `/workspace/{id}/go`
 * scrape, kept as the fallback. Not GET /zen/go/v1/usage with Bearer — that is
 * CodexBar's API-key path.
 */
export declare const OPENCODE_GO_ORIGIN = "https://opencode.ai";
export declare const OPENCODE_GO_WORKSPACES_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
export declare const OPENCODE_GO_QUOTA_TIMEOUT_MS = 10000;
export declare const OPENCODE_GO_PAGE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
/**
 * Signed-in email from the dashboard HTML. The page hydrates
 * `userEmail["wrk_…"]` and resolves it in the RSC flight payload
 * (`$R[m]($R[n],"email")`). The API key alone never exposes identity —
 * `/zen/go/v1/usage` returns numbers only — so this is cookie-only.
 */
export declare function parseOpencodeGoEmail(text: any, workspaceId: any): string | undefined;
/** Signed-in workspace name from the dashboard RSC payload. */
export declare function parseOpencodeGoWorkspaceName(text: any, workspaceId: any): string | undefined;
/**
 * Billing flags from the dashboard RSC payload. `useBalance` is the Zen
 * "use balance after limits" toggle; `balance` is its prepaid amount.
 */
export declare function parseOpencodeGoBilling(text: any): {
    useBalance: boolean | undefined;
    balance: number | undefined;
};
export declare function parseOpencodeGoUsage(text: any, now?: number): {
    rows: any[];
};
export declare function fetchOpencodeGoWorkspaceId(cookieHeader: any, { fetchFn, signal }?: any): Promise<string>;
/**
 * `GET /console/api/go/status` payload → quota rows. The meters are spend
 * counters in micro-cents (`usedMicroCents`/`limitMicroCents`), not tokens;
 * `month` carries no `resetsAt`, so the billing period end stands in. A null
 * body or `access: null` means the workspace has no Go subscription.
 */
export declare function parseOpencodeGoConsoleStatus(payload: any, now?: number): {
    rows: any[];
    renewsAt: number | undefined;
};
/** `GET /console/api/billing/status` payload → `{ useBalance, balance }`. */
export declare function parseOpencodeGoConsoleBilling(payload: any): any;
export declare function fetchOpencodeGoQuota(entry: any, options?: any): Promise<any>;
