/**
 * Anthropic subscription quota.
 *
 * GET /api/oauth/usage is the only source — one response carries the 5-hour,
 * weekly, and every model-scoped meter (Fable etc.). Same design as
 * stablyai/orca's claude-oauth-usage-request.ts: no billable Messages probe.
 * On failure the caller keeps the previous snapshot, so throwing is enough.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare function parseAnthropicUsage(payload: any): {
    rows: any[];
};
export declare function fetchAnthropicQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    planType: any;
    account: any;
    subscriptionStatus: string;
    rows: any[];
}>;
