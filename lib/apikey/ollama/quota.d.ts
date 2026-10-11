/**
 * Ollama Cloud quota: GET ollama.com/api/balance (official since
 * ollama/ollama#18829, 2026-10-07). `included` is oneOf — legacy plans carry
 * session/weekly `remaining_percent` (0..100 REMAINING) + `resets_at`; credit
 * plans carry `balance_usd` / `allowance_usd` / `period{from,until}`.
 * `purchased.balance_usd` rides alongside both. POST /api/me (GET is 405)
 * still gives identity. The old GET /api/usage `limits.*.usage` fractions are
 * gone — that endpoint is now a request-count history (?range=24h|7d|30d)
 * with no quota semantics, so it is not called. Balance allows 10 req/min
 * per user across all keys: no polling, two calls per refresh.
 */
import { outboundFetch } from '../../utils/outbound.js';
/** Global 5h unix buckets, only when a balance row ships no reset stamp. ollama/ollama#12532. */
export declare const OLLAMA_SESSION_WINDOW_S = 18000;
/** Global 7d unix buckets shifted −4d from epoch (Mon 00:00 UTC). ollama/ollama#12532. */
export declare const OLLAMA_WEEKLY_WINDOW_S = 604800;
export declare function ollamaSessionResetAt(now?: number): number;
export declare function ollamaWeeklyResetAt(now?: number): number;
export declare function parseOllamaBalance(balance: any, me: any, now?: number): {
    planType: string | undefined;
    account: string | undefined;
    rows: any[];
};
export declare function fetchOllamaQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    planType: string | undefined;
    account: string | undefined;
    rows: any[];
}>;
