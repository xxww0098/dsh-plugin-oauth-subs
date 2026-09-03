/**
 * Subscription quota:
 *   Codex  GET chatgpt.com/backend-api/wham/usage
 *          GET chatgpt.com/backend-api/wham/rate-limit-reset-credits
 *          POST …/rate-limit-reset-credits/consume
 *   Grok   GET cli-chat-proxy.grok.com/v1/billing?format=credits
 *          GET cli-chat-proxy.grok.com/v1/user?include=subscription
 *          POST grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
 *   Antigravity  POST daily-cloudcode-pa …/v1internal:loadCodeAssist
 *                POST daily-cloudcode-pa …/v1internal:retrieveUserQuotaSummary
 *                POST daily-cloudcode-pa …/v1internal:fetchAvailableModels (5h fallback)
 *                Official Model Quota UI is two groups × (weekly + 5-hour).
 *
 * Codex windows report used_percent; remaining is 100 − used.
 * Grok creditUsagePercent is also used-percent. Display remaining in the UI.
 * Unified-billing SuperGrok / X Premium+ payloads often omit that percent
 * on the CLI JSON; the grok.com gRPC-web path still has the weekly pool.
 */
export declare const QUOTA_TTL_MS = 60000;
export declare const QUOTA_TIMEOUT_MS = 10000;
export declare function asNumber(value: any): number;
export declare function creditBagAmounts(value: any): any;
export declare function stampOf(value: any): number;
export declare function parseCodexUsage(payload: any): {
    rows: any[];
    planType?: undefined;
} | {
    planType: any;
    rows: any[];
};
export declare function isAvailableResetCredit(credit: any): boolean;
export declare function parseResetCredits(payload: any): {
    nextExpiresAt?: number;
    availableCount: number;
    credits: {
        id: string;
        status: any;
        expiresAt: number;
    }[];
};
export declare function parseGrokBilling(billing: any, { cliUser }?: {}): {
    rows: any[];
    planType?: undefined;
    subscriptionStatus?: undefined;
    hasGrokCodeAccess?: undefined;
} | {
    planType: any;
    subscriptionStatus: any;
    hasGrokCodeAccess: boolean;
    rows: any[];
};
export declare function applyGrokCreditsSnapshot(parsed: any, snapshot: any): any;
export declare function glmWindowKind(item: any): "cycle" | "weekly" | "mcp" | "primary";
export declare function parseGlmQuota(payload: any): {
    rows: any[];
    planType?: undefined;
} | {
    planType: any;
    rows: any[];
};
export declare function mergeGlmToolUsage(parsed: any, toolPayload: any): any;
export declare function parseKiroUsage(payload: any): {
    rows: any[];
    planType?: undefined;
    account?: undefined;
} | {
    planType: string | number;
    account: any;
    rows: {
        key: string;
        kind: string;
        usedPercent: number;
        remainingPercent: number;
        used: number;
        total: number;
        remaining: number;
        resetAt: number;
    }[];
};
export declare function parseCursorPeriodUsage(payload: any): {
    rows: any[];
    planType?: undefined;
    account?: undefined;
} | {
    planType: string | number;
    account: any;
    rows: {
        resetAt?: any;
        key: string;
        kind: string;
        product: any;
        usedPercent: number;
        remainingPercent: number;
    }[];
};
export declare function fetchCursorQuota(session: any, fetchFn?: typeof fetch): Promise<{
    rows: any[];
    planType?: undefined;
    account?: undefined;
} | {
    planType: string | number;
    account: any;
    rows: {
        resetAt?: any;
        key: string;
        kind: string;
        product: any;
        usedPercent: number;
        remainingPercent: number;
    }[];
}>;
export declare function fetchGlmQuota(session: any, fetchFn?: typeof fetch): Promise<any>;
/** SkillStar `parse_model_windows` — group fetchAvailableModels into product bars. */
export declare function parseAntigravityModelQuota(payload: any): {
    rows: any[];
};
/** Official Model Quota panel: Gemini Models / Claude and GPT models × weekly + 5-hour. */
export declare function parseAntigravityQuotaSummary(payload: any): {
    rows: any[];
    planType: string;
};
export declare function parseAntigravityPaidCredits(payload: any): any[];
export declare function pickAntigravityPlanName(payload: any): string;
export declare function fetchAntigravityQuota(session: any, fetchFn?: typeof fetch): Promise<{
    planType: string;
    rows: any[];
}>;
export declare function fetchKiroQuota(session: any, fetchFn?: typeof fetch): Promise<{
    rows: any[];
    planType?: undefined;
    account?: undefined;
} | {
    planType: string | number;
    account: any;
    rows: {
        key: string;
        kind: string;
        usedPercent: number;
        remainingPercent: number;
        used: number;
        total: number;
        remaining: number;
        resetAt: number;
    }[];
}>;
export declare function fetchCodexQuota(session: any, fetchFn?: typeof fetch): Promise<{
    resetCredits: {
        nextExpiresAt?: number;
        availableCount: number;
        credits: {
            id: string;
            status: any;
            expiresAt: number;
        }[];
    };
    rows: any[];
    planType?: undefined;
} | {
    resetCredits: {
        nextExpiresAt?: number;
        availableCount: number;
        credits: {
            id: string;
            status: any;
            expiresAt: number;
        }[];
    };
    planType: any;
    rows: any[];
}>;
export declare function consumeResetBody(redeemRequestId: any): {
    redeem_request_id: any;
    idempotencyKey: any;
};
export declare function consumeCodexReset(session: any, fetchFn?: typeof fetch): Promise<{
    ok: boolean;
    redeemRequestId: `${string}-${string}-${string}-${string}-${string}`;
}>;
export declare function fetchGrokQuota(session: any, fetchFn?: typeof fetch): Promise<any>;
export declare class QuotaStore {
    #private;
    constructor({ tokens, fetchFn, ttlMs }?: {
        fetchFn?: typeof fetch;
        ttlMs?: number;
    });
    peek(provider: any, accountId: any): {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
    clear(provider: any, accountId: any): void;
    ensure(provider: any, accountId: any, session: any): Promise<any>;
    refresh(provider: any, accountId: any, session: any): Promise<any>;
    consume(provider: any, accountId: any, session: any): Promise<any>;
}
