export declare class DeviceFlowManager {
    attempts: Map<string, any>;
    starting: Set<string>;
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
