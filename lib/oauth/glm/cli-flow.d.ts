/**
 * ZCode CLI poll login. The browser opens authorize_url; the plugin polls
 * until the flow is ready. No loopback, no PKCE, no user code.
 * `region` is `zai` (global) or `bigmodel` (China); the CLI provider id
 * posted to /oauth/cli/init is `zai` or `bigmodel`.
 */
/**
 * Upstream OAuth incidents the client cannot fix. `3004 invalid_flow` is the
 * server killing the flow while exchanging the browser code — reported for
 * BigModel with the desktop app fully out of the loop (zai-org/feedback#718,
 * related #705). `500 { code: 2007 }` is the token endpoint itself failing
 * (zai-org/feedback#523). Both leave a working fallback: the other region
 * button, or a pasted Coding Plan API key.
 */
export declare function glmLoginFailureMessage(error: any): string;
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
