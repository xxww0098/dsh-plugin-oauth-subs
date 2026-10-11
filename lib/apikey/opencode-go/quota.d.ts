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
    subscription: {
        useBalance?: any;
        state: string;
        product: string | undefined;
    };
};
/** `GET /console/api/billing/status` payload → `{ balance }`. */
export declare function parseOpencodeGoConsoleBilling(payload: any): any;
/**
 * OpenCode Zen Console reads — same cookie + `x-org-id` as the Go meters,
 * because Zen is the pay-as-you-go side of the same workspace.
 *
 * `GET /console/api/billing/status` carries the prepaid amounts
 * (`billingMode` prepaid|legacy|seat|credit, `balanceMicroCents`,
 * `availableMicroCents`, `creditLimitMicroCents`); `GET
 * /console/api/usage/summary?range=30d` carries the workspace's 30-day spend
 * (`totalCostMicroCents` + request/token counters). CodexBar's OpenCode (Zen)
 * provider reads exactly these two (OpenCodeConsoleUsageFetcher +
 * OpenCodeZenBillingParser) and treats the summary as the monthly spend of a
 * pay-as-you-go workspace.
 */
export declare function parseOpencodeZenBilling(payload: any): any;
/**
 * Zen wallet rows: the prepaid side of the same OpenCode account that carries
 * the Go subscription. The Go docs state the link outright — "If you also have
 * credits on your Zen balance, you can enable the Use balance option in the
 * console. When enabled, Go will fall back to your Zen balance after you've
 * reached your usage limits" — which is exactly the `useBalance` field the Go
 * side has always read as 余额兜底.
 *
 * The Zen section is only the wallet: no usage ledger, no request counter. The
 * console's `/console/api/usage/summary` is the **workspace's** 30-day ledger
 * (`x-org-id`; `range=7d` tracks the Go week meter), so on a Go account it
 * would report Go usage under a Zen heading — the exact mis-attribution this
 * section must not make. Go's own meters already state consumption.
 *
 * There is deliberately **no** monthly-limit row either: the console JSON API
 * exposes none (`/console/api/usage`, `/billing/limits`, `/zen/status` all 404, and
 * `usage/summary` takes only `30d`/`7d`/`all`), while the docs' monthly limit
 * ("Zen will not use more than $20 in a month") is only reachable through the
 * dashboard's SolidStart billing function (`/_server?id=c83b78…`), which needs
 * the `auth=` dashboard session and answers 302 to `/console/login` once that
 * expires. So the card states what the account really has instead of inventing
 * a denominator.
 */
export declare function opencodeZenQuotaRows(zen: any): any[];
export declare function fetchOpencodeGoQuota(entry: any, options?: any): Promise<any>;
