/**
 * Ollama Cloud quota: GET ollama.com/api/usage (limits.session/weekly.usage
 * are 0..1 fractions) and POST ollama.com/api/me (GET is 405).
 */
import { outboundFetch } from '../../utils/outbound.js';
/** Global 5h unix buckets. ollama/ollama#12532: `18000 - (epoch % 18000)`. */
export declare const OLLAMA_SESSION_WINDOW_S = 18000;
/** Global 7d unix buckets, −4d from epoch (Mon 00:00 UTC). ollama/ollama#12532. */
export declare const OLLAMA_WEEKLY_WINDOW_S = 604800;
export declare function ollamaSessionResetAt(now?: number): number;
export declare function ollamaWeeklyResetAt(now?: number): number;
export declare function parseOllamaUsage(payload: any, me: any, now?: number): {
    planType: string | undefined;
    account: string | undefined;
    rows: any[];
};
export declare function fetchOllamaQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    planType: string | undefined;
    account: string | undefined;
    rows: any[];
}>;
