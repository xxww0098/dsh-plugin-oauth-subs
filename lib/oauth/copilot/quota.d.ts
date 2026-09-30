/**
 * Copilot quota: GET api.github.com/copilot_internal/user
 * (premium_interactions remaining %), authorized with the GitHub token.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare function parseCopilotUsage(payload: any, user?: any): {
    planType: any;
    account: any;
    rows: any[];
};
export declare function fetchCopilotQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    account: any;
    planType: any;
    rows: any[];
}>;
