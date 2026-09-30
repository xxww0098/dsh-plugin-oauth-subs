/**
 * Kimi quota: /usages windows plus /me for identity.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare function parseKimiUsage(payload: any, me: any): {
    planType: string | undefined;
    account: string | undefined;
    rows: any[];
};
export declare function fetchKimiQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    planType: string | undefined;
    account: string | undefined;
    rows: any[];
}>;
