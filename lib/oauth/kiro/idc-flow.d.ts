/**
 * AWS SSO OIDC device authorization for Builder ID and IAM Identity Center.
 * JSON bodies (not form-urlencoded). Register a public client every login.
 */
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
    attempts: Map<string, any>;
    constructor();
    isBusy(provider: any): boolean;
    pending(provider: any): any;
    start(provider: any, { region, startUrl, kind, fetchFn }?: {
        region?: string | undefined;
        startUrl?: string | undefined;
        kind?: string | undefined;
        fetchFn?: typeof fetch | undefined;
    }): Promise<{
        verificationUrl: any;
        verificationUri: any;
        userCode: any;
        kind: string;
        waitToken: () => Promise<unknown>;
        cancel: () => void;
    }>;
}
