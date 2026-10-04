/**
 * Antigravity account lifecycle for AuthController: PKCE login start and code
 * exchange, plan write-back, and the Google validation probe.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function rememberAntigravityPlan(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function probeAntigravity(ctl: AuthController, source: any): Promise<void>;
export declare function loginAntigravity(ctl: AuthController): Promise<{
    authorizeUrl: any;
    redirectUri: string;
    mode: string;
}>;
export declare function completeAntigravityPaste(ctl: AuthController, code: any, attempt: any): Promise<{
    validationUrl?: string | undefined;
    needsValidation?: boolean | undefined;
    planType?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
    account: string;
    projectId: any;
}>;
