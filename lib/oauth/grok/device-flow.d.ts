/**
 * RFC 8628 device-authorization flow. The user opens a verification URL and
 * types a short code while the plugin polls the token endpoint.
 */
export declare class DeviceFlowManager {
    constructor();
    isBusy(provider: any): any;
    pending(provider: any): any;
    start(provider: any, spec: any): Promise<{
        verificationUrl: any;
        verificationUri: any;
        userCode: any;
        waitToken: () => Promise<unknown>;
        cancel: () => void;
    }>;
}
