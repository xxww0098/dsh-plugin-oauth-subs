/**
 * ZCode CLI poll login. The browser opens authorize_url; the plugin polls
 * until the flow is ready. No loopback, no PKCE, no user code.
 */
export declare class GlmCliFlowManager {
    constructor();
    isBusy(provider: any): any;
    pending(provider: any): any;
    start(provider: any, { region, fetchFn }?: {
        region?: string;
        fetchFn?: typeof fetch;
    }): Promise<{
        authorizeUrl: string;
        flowId: string;
        mode: string;
        waitToken: () => Promise<unknown>;
        cancel: () => void;
    }>;
}
