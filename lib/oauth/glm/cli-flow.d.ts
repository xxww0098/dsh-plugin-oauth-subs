/**
 * ZCode CLI poll login. The browser opens authorize_url; the plugin polls
 * until the flow is ready. No loopback, no PKCE, no user code.
 * `region` is `zai` (global) or `bigmodel` (China); the CLI provider id
 * posted to /oauth/cli/init is `zai` or `bigmodel`.
 */
export declare class GlmCliFlowManager {
    attempts: Map<string, any>;
    constructor();
    isBusy(provider: any): boolean;
    pending(provider: any): any;
    start(provider: any, { region, fetchFn }?: {
        region?: string | undefined;
        fetchFn?: typeof fetch | undefined;
    }): Promise<{
        authorizeUrl: string;
        flowId: string;
        mode: string;
        waitToken: () => Promise<unknown>;
        cancel: () => void;
    }>;
}
