/**
 * RFC 8628 device-authorization flow. The user opens a verification URL and
 * types a short code while the plugin polls the token endpoint.
 */
export declare class DeviceFlowManager {
    attempts: Map<string, any>;
    constructor();
    isBusy(provider: any): boolean;
    pending(provider: any): any;
    start(provider: any, spec: any): Promise<{
        verificationUrl: any;
        verificationUri: any;
        userCode: any;
        waitToken: () => Promise<unknown>;
        cancel: () => void;
    }>;
}
