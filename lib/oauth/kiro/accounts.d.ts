/**
 * Kiro account lifecycle for AuthController: live catalog discovery, Social / Builder ID /
 * IdC login, pasted keys and batch imports, and profile write-back.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function discoverKiro(ctl: AuthController, session: any): Promise<any>;
export declare function rememberKiroProfile(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function existingKiroMachineId(ctl: AuthController): Promise<string | undefined>;
export declare function loginKiro(ctl: AuthController, payload?: any): Promise<{
    authorizeUrl: any;
    verificationUri: any;
    userCode: any;
    mode: string;
    kind: string;
    startUrl: any;
    redirectUri?: undefined;
    machineId?: undefined;
} | {
    authorizeUrl: any;
    redirectUri: any;
    mode: string;
    machineId: string;
    verificationUri?: undefined;
    userCode?: undefined;
    kind?: undefined;
    startUrl?: undefined;
}>;
export declare function completeKiroIdc(ctl: AuthController, attempt: any): Promise<void>;
/**
 * The Kiro portal redirected an organization login to the IdC device flow
 * (`login_option=awsidc`, issue #167): settle through the device attempt
 * the callback already started instead of exchanging a code. Returns true
 * when the paste completion is settled (or cancelled) this way.
 */
export declare function resumeKiroIdcPaste(ctl: AuthController, code: any, claim: any): boolean;
export declare function completeKiroPaste(ctl: AuthController, code: any, attempt: any): Promise<any>;
export declare function useKiroKey(ctl: AuthController, key: any, payload?: any): Promise<{
    method: any;
    account: Record<string, unknown> | undefined;
    count: number;
}>;
export declare function saveKiroImports(ctl: AuthController, sessions: any, { refreshMissingAccess }?: {
    refreshMissingAccess?: boolean | undefined;
}): Promise<{
    method: any;
    account: Record<string, unknown> | undefined;
    count: number;
}>;
