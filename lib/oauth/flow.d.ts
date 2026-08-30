/**
 * Generic OAuth authorization-code flow engine: one temporary loopback HTTP
 * server per login attempt receives the provider's redirect, validates
 * `state`, and yields the authorization `code`. A pasted callback URL carrying
 * the matching state can substitute for the browser redirect (`manual`).
 */
export declare const DEFAULT_FLOW_TIMEOUT_MS = 180000;
export declare class OAuthFlowManager {
    constructor();
    isBusy(provider: any): any;
    pending(provider: any): any;
    start(provider: any, spec: any): Promise<{
        authorizeUrl: any;
        redirectUri: string;
        pkce: {
            verifier: any;
            challenge: any;
        };
        state: any;
        waitCode: () => Promise<unknown>;
        manual(rawInput: any): void;
        cancel(): void;
    }>;
}
