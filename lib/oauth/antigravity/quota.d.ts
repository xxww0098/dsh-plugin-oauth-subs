/**
 * Antigravity quota: loadCodeAssist, retrieveUserQuotaSummary, and
 * fetchAvailableModels as the 5-hour fallback. The official Model Quota UI is
 * two groups × (weekly + 5-hour).
 */
import { outboundFetch } from '../../utils/outbound.js';
/** SkillStar `parse_model_windows` — group fetchAvailableModels into product bars. */
export declare function parseAntigravityModelQuota(payload: any): {
    rows: any[];
};
/** Official Model Quota panel: Gemini Models / Claude and GPT models × weekly + 5-hour. */
export declare function parseAntigravityQuotaSummary(payload: any): {
    rows: any[];
    planType: string | undefined;
};
export declare function parseAntigravityPaidCredits(payload: any): any[];
export declare function pickAntigravityPlanName(payload: any): string | undefined;
export declare function fetchAntigravityQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    planType: string | undefined;
    rows: any[];
}>;
