/**
 * AWS SSO OIDC device authorization for Builder ID and IAM Identity Center.
 * JSON bodies (not form-urlencoded). Register a public client every login.
 */
export declare function registerKiroOidcClient({ region, startUrl, fetchFn, signal }?: {
    region?: string;
    fetchFn?: typeof fetch;
}): Promise<{
    clientId: any;
    clientSecret: any;
    startUrl: any;
    region: string;
}>;
export declare function kiroIdcSession(tokens: any, registered: any, { kind }?: {
    kind?: string;
}): {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    authMethod: string;
    kiroProvider: string;
    planType: string;
    profileArn: string;
    clientId: string;
    clientSecret: string;
    startUrl: string;
    tokenEndpoint: string;
    issuerUrl: string;
    scopes: string;
    region: string;
    authRegion: string;
    apiRegion: string;
    kiroApiKey: string;
};
export declare class KiroIdcFlowManager {
    constructor();
    isBusy(provider: any): any;
    pending(provider: any): any;
    start(provider: any, { region, startUrl, kind, fetchFn }?: {
        region?: string;
        startUrl?: string;
        kind?: string;
        fetchFn?: typeof fetch;
    }): Promise<{
        verificationUrl: any;
        verificationUri: any;
        userCode: any;
        kind: string;
        waitToken: () => Promise<unknown>;
        cancel: () => void;
    }>;
}
