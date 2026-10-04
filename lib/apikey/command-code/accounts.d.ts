/**
 * Command Code account lifecycle for AuthController: loopback login start and pasted
 * keys, auth.json auto-import, whoami identity, and the loopback-callback login completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../../oauth/controller.js';
export declare function maybeAutoImportCommandCode(ctl: AuthController): Promise<void>;
export declare function importCommandCode(ctl: AuthController): Promise<{
    source: any;
    session: any;
    skipped: boolean;
} | {
    session: any;
    source: string;
    skipped?: undefined;
}>;
export declare function finishCommandCodeSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberCommandCodeIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
/**
 * Command Code's waitCode resolves with the callback credentials
 * {apiKey,userId,userName,keyName} — the session builds directly, there is
 * no token exchange (flow.ts collect() already state-checked the callback).
 */
export declare function completeCommandCode(ctl: AuthController, attempt: any, claim: any): Promise<void>;
export declare function loginCommandCode(ctl: AuthController): Promise<{
    authorizeUrl: any;
    redirectUri: string;
    mode: string;
}>;
export declare function useCommandCodeKey(ctl: AuthController, key: any): Promise<{
    account: {
        account: any;
        planType: any;
        planLabel: any;
        expiresAt: any;
        region?: undefined;
        needsValidation?: undefined;
        validationUrl?: undefined;
        method?: undefined;
        methodLabel?: undefined;
        organizationName?: undefined;
        scopes?: undefined;
    } | {
        account: string | undefined;
        planType: any;
        planLabel: any;
        region: string;
        expiresAt: any;
        needsValidation?: undefined;
        validationUrl?: undefined;
        method?: undefined;
        methodLabel?: undefined;
        organizationName?: undefined;
        scopes?: undefined;
    } | {
        account: any;
        planType: any;
        planLabel: any;
        expiresAt: any;
        needsValidation: boolean;
        validationUrl: any;
        region?: undefined;
        method?: undefined;
        methodLabel?: undefined;
        organizationName?: undefined;
        scopes?: undefined;
    } | {
        account: any;
        planType: any;
        planLabel: any;
        method: any;
        methodLabel: string | undefined;
        expiresAt: any;
        region?: undefined;
        needsValidation?: undefined;
        validationUrl?: undefined;
        organizationName?: undefined;
        scopes?: undefined;
    } | {
        account: any;
        planType: any;
        planLabel: any;
        method: any;
        methodLabel: string | undefined;
        organizationName: any;
        expiresAt: any;
        region?: undefined;
        needsValidation?: undefined;
        validationUrl?: undefined;
        scopes?: undefined;
    } | {
        account: any;
        planType: any;
        planLabel: any;
        scopes: any;
        expiresAt: any;
        region?: undefined;
        needsValidation?: undefined;
        validationUrl?: undefined;
        method?: undefined;
        methodLabel?: undefined;
        organizationName?: undefined;
    } | undefined;
}>;
