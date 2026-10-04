/**
 * Ollama Cloud account lifecycle for AuthController: paste-only login (browser
 * login rejects), live catalog discovery, OLLAMA_API_KEY auto-import, and identity
 * from /api/me.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../../oauth/controller.js';
export declare function discoverOllama(ctl: AuthController, session: any): Promise<any>;
export declare function maybeAutoImportOllama(ctl: AuthController): Promise<void>;
export declare function importOllama(ctl: AuthController): Promise<{
    source: any;
    session: any;
    skipped: boolean;
} | {
    session: any;
    source: any;
    skipped?: undefined;
}>;
export declare function finishOllamaSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberOllamaIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function loginOllama(): void;
export declare function useOllamaKey(ctl: AuthController, key: any): Promise<{
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
