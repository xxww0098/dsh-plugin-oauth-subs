/**
 * Login entry points behind the Settings RPC: browser / device / CLI flow
 * start, paste completion, pasted keys, and local imports. Every family
 * specific flow lives in that family's accounts.ts / import.ts; this module
 * only dispatches through the family registry (families.ts) and owns the
 * shared attempt lifecycle and error shaping.
 */
import type { AuthController } from './controller.js';
export declare function login(ctl: AuthController, provider: any, options: any): Promise<unknown>;
/** Grok's device-flow completion; the other device families own theirs in accounts.ts. */
export { completeGrokDeviceFlow as completeDevice } from './grok/accounts.js';
export declare function completePkce(ctl: AuthController, provider: any, attempt: any, claim: any): Promise<void>;
export declare function useKey(ctl: AuthController, provider: any, key: any, extra: any): Promise<unknown>;
export declare function importFrom(ctl: AuthController, provider: any): Promise<{
    source: any;
    account: Record<string, unknown> | undefined;
    count: any;
}>;
