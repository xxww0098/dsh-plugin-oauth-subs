/**
 * Login entry points behind the Settings RPC: browser / device / CLI flow
 * start, PKCE and Grok device completion, pasted keys, and local imports.
 * Family-specific completions live in each family's accounts.ts.
 */
import type { AuthController } from './controller.js';
export declare function login(ctl: AuthController, provider: any, options: any): Promise<{
    authorizeUrl: any;
    redirectUri: any;
    mode: string;
    registering: any;
} | {
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
} | {
    authorizeUrl: any;
    mode: string;
    region: string;
    redirectUri?: undefined;
    verificationUri?: undefined;
    userCode?: undefined;
} | {
    authorizeUrl: string;
    mode: string;
    region?: undefined;
    redirectUri?: undefined;
    verificationUri?: undefined;
    userCode?: undefined;
} | {
    authorizeUrl: any;
    redirectUri: string;
    mode: string;
    region?: undefined;
    verificationUri?: undefined;
    userCode?: undefined;
} | {
    authorizeUrl: any;
    verificationUri: any;
    userCode: any;
    mode: string;
    region?: undefined;
    redirectUri?: undefined;
}>;
export declare function completePkce(ctl: AuthController, provider: any, attempt: any, claim: any): Promise<void>;
export declare function completeDevice(ctl: AuthController, provider: any, attempt: any): Promise<void>;
export declare function useKey(ctl: AuthController, provider: any, key: any, extra: any): Promise<{
    method: any;
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
    count: number;
} | {
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
    region?: undefined;
} | {
    region: string;
    account?: undefined;
}>;
export declare function importFrom(ctl: AuthController, provider: any): Promise<{
    source: any;
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
    count: any;
}>;
