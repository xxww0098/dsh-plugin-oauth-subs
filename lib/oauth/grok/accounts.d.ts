/**
 * Grok account lifecycle for AuthController: device / PKCE login start and
 * completion. Functions take the controller as their first argument; the
 * class keeps the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function loginGrok(ctl: AuthController, payload?: any): Promise<{
    authorizeUrl: any;
    verificationUri: any;
    userCode: any;
    mode: string;
    redirectUri?: undefined;
} | {
    authorizeUrl: any;
    redirectUri: string;
    mode: string;
    verificationUri?: undefined;
    userCode?: undefined;
}>;
export declare function completeGrokPaste(ctl: AuthController, code: any, attempt: any): Promise<{
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
}>;
export declare function completeGrokDeviceFlow(ctl: AuthController, provider: any, attempt: any): Promise<void>;
