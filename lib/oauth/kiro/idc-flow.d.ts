/**
 * AWS SSO OIDC device authorization for Builder ID and IAM Identity Center.
 * JSON bodies (not form-urlencoded). Register a public client every login.
 */
import { outboundFetch } from '../../utils/outbound.js';
import { createFlowAttempts } from '../flow.js';
export declare function registerKiroOidcClient({ region, startUrl, fetchFn, signal }?: any): Promise<{
    clientId: any;
    clientSecret: any;
    startUrl: any;
    region: any;
}>;
export declare function kiroIdcSession(tokens: any, registered: any, { kind }?: {
    kind?: string | undefined;
}): any;
export declare class KiroIdcFlowManager {
    attempts: ReturnType<typeof createFlowAttempts>;
    constructor();
    isBusy(provider: any): boolean;
    pending(provider: any): any;
    start(provider: any, { region, startUrl, kind, fetchFn }?: {
        region?: string | undefined;
        startUrl?: string | undefined;
        kind?: string | undefined;
        fetchFn?: typeof outboundFetch | undefined;
    }): Promise<any>;
}
