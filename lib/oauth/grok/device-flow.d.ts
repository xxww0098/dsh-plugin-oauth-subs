import { createFlowAttempts } from '../flow.js';
export declare class DeviceFlowManager {
    attempts: ReturnType<typeof createFlowAttempts>;
    constructor();
    isBusy(provider: any): boolean;
    pending(provider: any): any;
    start(provider: any, spec: any): Promise<any>;
}
