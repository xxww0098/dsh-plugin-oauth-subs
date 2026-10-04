/**
 * Codex account lifecycle for AuthController: PKCE login start and the
 * loopback code exchange. Functions take the controller as their first
 * argument; the class keeps the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function loginCodex(ctl: AuthController): Promise<{
    authorizeUrl: any;
    redirectUri: string;
    mode: string;
}>;
export declare function completeCodexPaste(ctl: AuthController, code: any, attempt: any): Promise<{
    planType?: any;
    emailAddress?: any;
    idToken?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    accountId: any;
}>;
