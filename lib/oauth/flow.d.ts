/**
 * Generic OAuth authorization-code flow engine: one temporary loopback HTTP
 * server per login attempt receives the provider's redirect, validates
 * `state`, and yields the authorization `code`. A pasted callback URL carrying
 * the matching state can substitute for the browser redirect (`manual`).
 * Families whose callback carries something other than a `code` (Command Code
 * credentials, Kiro's IdC pivot) provide `spec.collect`, which may be async;
 * `spec.callbackPage(result)` overrides the rendered success page.
 *
 * The poll-style login managers (Grok device flow, Kiro IdC, GLM CLI) share
 * `createFlowAttempts()` below for their generic attempt bookkeeping.
 */
export declare const DEFAULT_FLOW_TIMEOUT_MS = 180000;
/**
 * Abortable delay shared by the poll-style login flows (Grok device, Kiro IdC,
 * GLM CLI poll). Rejects with the abort reason — or a plain `aborted` error —
 * and removes its abort listener on both exit paths.
 */
export declare function sleep(ms: any, signal: any): Promise<void>;
/**
 * Attempt bookkeeping shared by the poll-style login managers (Grok device
 * flow, Kiro IdC, GLM CLI). Each manager owns one registry: no sessions,
 * caches, or provider ids live here — only the one-attempt-per-provider slot
 * handling and the deferred token promise the family poll loop settles.
 *
 * `begin(provider)` reserves the slot synchronously (across start()'s
 * registration awaits) and returns a handle: `abandon()` when registration
 * failed, `publish(fields)` to register the attempt — adding the shared
 * `waitToken`/`cancel` surface — and `settle(error?, value?)` when it
 * resolves. `settle` and `owns` ignore calls from an attempt that no
 * longer owns the slot (a newer login may already have taken it).
 */
export declare function createFlowAttempts(): {
    isBusy(provider: any): boolean;
    pending(provider: any): any;
    begin: (provider: any) => {
        signal: AbortSignal;
        settle: (error: any, value?: any) => void;
        /** Registration failed before publish: release the reserved slot. */
        abandon(): void;
        /** Is `attempt` still the one registered under this provider? */
        owns(attempt: any): boolean;
        /** Register the attempt under the provider and arm settle() for it. */
        publish(fields: any): any;
    };
};
/** Path + query the browser actually landed on (Kiro token exchange needs this). */
export declare function oauthCallbackFromUrl(url: any, fallbackPath: any): {
    pathname: any;
    loginOption: any;
    issuerUrl: any;
};
export declare class OAuthFlowManager {
    attempts: Map<string, any>;
    starting: Set<string>;
    constructor();
    isBusy(provider: any): boolean;
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
        callback(): any;
        manual(rawInput: any): void;
        cancel(): void;
    }>;
}
