/**
 * Command Code quota: mirrors the CLI's `fetchUsageData` —
 *
 *   GET /alpha/whoami?limits=1            → user + org id
 *   GET /alpha/billing/credits?orgId=…    → credit pools + windowLimits
 *   GET /alpha/billing/subscriptions?orgId=… → planId/status/period
 *   GET /alpha/usage/summary?orgId=…&since=<currentPeriodStart>
 *
 * Credits are USD balances. `windowLimits.{fiveHour,weekly}` rows carry
 * `{used, cap, resetAt}`; `subscription.data` carries `{planId, status,
 * currentPeriodStart, currentPeriodEnd}` (active statuses are the CLI's
 * `no` set: active/trialing/past_due). The credits pool follows the CLI's
 * projectUsageView: remaining monthly+purchased+free against the plan's
 * monthly total when a subscription is active, else spent+remaining.
 */
import { outboundFetch } from '../../utils/outbound.js';
/**
 * `getPlanInfo`: planId lowercased, `_`→`-`, longest-prefix match against the
 * plan table (so `individual-pro-v1` wins over `individual-pro`). Unknown ids
 * fall back to the `getPlanDisplayName` strip of `individual-`/`teams-`.
 */
export declare function commandCodePlanInfo(planId: any): {
    id: string;
    name: any;
    monthlyCredits: any;
} | undefined;
/** planType stored on the session → display label (plan.ts uses this). */
export declare function commandCodePlanLabel(planId: any): any;
/**
 * Parse the four-endpoint bundle into { account, planType, rows }.
 * Arguments are the raw endpoint payloads (any may be undefined/absent).
 */
export declare function parseCommandCodeUsage({ whoami, credits, subscription, summary }?: any): {
    account: any;
    planType: any;
    userId: any;
    userName: any;
    email: any;
    orgId: any;
    rows: any[];
};
/**
 * Full quota fetch — same sequence as the CLI: whoami first (the org id and
 * `limits=1` flag come from it), credits+subscriptions in parallel, then the
 * usage summary scoped to the subscription's currentPeriodStart.
 */
export declare function fetchCommandCodeQuota(session: any, fetchFn?: typeof outboundFetch, { timeoutMs }?: any): Promise<{
    account: any;
    planType: any;
    userId: any;
    userName: any;
    email: any;
    orgId: any;
    rows: any[];
}>;
