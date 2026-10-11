/**
 * Grok quota: GET cli-chat-proxy.grok.com/v1/billing?format=credits and
 * /v1/user?include=subscription, the grok.com gRPC-web credits config
 * (unified-billing plans omit the CLI percent), and the reset-card bank
 * (ConsumerUiSvc/GetRemainingResets, RedeemReset).
 *
 * creditUsagePercent is used-percent; the UI shows remaining. Unified-billing
 * SuperGrok / X Premium+ payloads often omit it on the CLI JSON; the grok.com
 * gRPC-web path still has the weekly pool.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare function parseGrokBilling(billing: any, { cliUser }?: any): {
    rows: never[];
    planType?: undefined;
    subscriptionStatus?: undefined;
    hasGrokCodeAccess?: undefined;
} | {
    planType: string | undefined;
    subscriptionStatus: any;
    hasGrokCodeAccess: boolean | undefined;
    rows: any[];
};
export declare function applyGrokCreditsSnapshot(parsed: any, snapshot: any): any;
export declare function fetchGrokQuota(session: any, fetchFn?: typeof outboundFetch): Promise<any>;
/**
 * Live reset tokens (with their secret ids — host-only). Throws on any
 * transport / gRPC failure so a caller never reads a failure as "no cards";
 * an empty DATA frame + grpc-status 0 is a real zero.
 */
export declare function fetchGrokResetTokens(session: any, fetchFn?: typeof outboundFetch): Promise<any[]>;
/**
 * Redeem one token. The token id is the idempotency key: a retry after a lost
 * answer comes back `alreadyRedeemed`, which counts as done. `noCredit`
 * throws `GrokResetRejected` (nothing was spent).
 */
export declare class GrokResetRejected extends Error {
}
export declare function consumeGrokResetToken(session: any, tokenId: any, fetchFn?: typeof outboundFetch): Promise<{
    ok: boolean;
    outcome: string;
}>;
/**
 * Spend the card the panel named by its public id — the family's reset hook
 * (families.ts), driven by QuotaStore.consume. The public id is a hash
 * (reset-frame.ts), so the token is resolved by a fresh list read: a card
 * spent or expired since the panel rendered is refused instead of silently
 * spending another.
 */
export declare function spendGrokResetCard(session: any, creditId: any, { fetchFn }: any): Promise<void>;
