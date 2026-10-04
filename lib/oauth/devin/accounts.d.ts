/**
 * Devin account lifecycle for AuthController: PKCE login and pasted keys, live
 * catalog discovery, credentials.toml auto-import, and identity.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function discoverDevin(ctl: AuthController, session: any): Promise<any>;
export declare function maybeAutoImportDevin(ctl: AuthController): Promise<void>;
export declare function importDevin(ctl: AuthController): Promise<{
    source: any;
    session: any;
    skipped: boolean;
} | {
    session: any;
    source: string;
    path: any;
    skipped?: undefined;
}>;
export declare function finishDevinSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberDevinIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function loginDevin(ctl: AuthController): Promise<{
    authorizeUrl: any;
    redirectUri: string;
    mode: string;
}>;
export declare function completeDevinPaste(ctl: AuthController, code: any, attempt: any): Promise<{
    source: any;
    apiServer?: string | undefined;
    planType?: string | undefined;
    account?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}>;
export declare function useDevinKey(ctl: AuthController, key: any): Promise<{
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
