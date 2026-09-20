/**
 * Cline quota. Two authenticated reads plus one optional plan read:
 *   GET /api/v1/users/me                → identity (email, usr-… id)
 *   GET /api/v1/users/{id}/balance      → credit balance, micro-USD
 *   GET /api/v1/users/me/plan           → subscription plan (404 = none)
 *
 * `ClineAccountService` in the pinned CLI reads exactly these; the balance is
 * divided by 1e6 (`normalizeCreditBalance` in `apps/cli/src/utils/output.ts`)
 * before it is shown as USD. Cline ships no percent-based window endpoint —
 * ClinePass limits surface only as a 429/402 body — so the card carries the
 * credit balance (`prepaid` row) and the plan name.
 */
/** `normalizeCreditBalance` — micro-USD → USD. */
export declare function clineCreditUsd(value: any): number | undefined;
export declare function parseClineBalance(payload: any): {
    userId?: any;
    usd: number;
} | undefined;
/** Entitlement caps share the 1e-8 USD unit of `/usages.costUsd`. */
export declare function clineCapUsd(value: any): number | undefined;
/**
 * `/api/v1/users/me/plan` — `UserCurrentPlan`; 404 when the user has none.
 * ClinePass caps ride `data.plan.entitlements.cline_pass
 * .inferenceCapThreshold`; a credit account carries none, so a bar is only
 * ever drawn from a cap the server actually sent.
 */
export declare function parseClinePlan(payload: any): {
    caps?: any;
    periodEnd?: number | undefined;
    planType?: any;
} | undefined;
/**
 * `GET /api/v1/users/me/plan/usage-limits` — server-truth rolling windows:
 * `{success, data:{limits:[{type, percentUsed, resetsAt}]}}` with
 * `type ∈ five_hour | weekly | monthly`. A credit account answers the same
 * plan-level 404 as `/users/me/plan` (`no plan history found for user`) —
 * live-probed 2026-09-19, which is what separates it from a missing route
 * (`{"error":"Not Found"}`).
 */
export declare function parseClinePlanLimits(payload: any): any[];
export declare function parseClineUsage(user: any, balance: any, plan: any, limits?: any[]): {
    account: string | undefined;
    userId: any;
    planType: any;
    rows: any[];
};
export declare function fetchClineQuota(session: any, fetchFn?: typeof fetch): Promise<{
    account: string | undefined;
    userId: any;
    planType: any;
    rows: any[];
}>;
