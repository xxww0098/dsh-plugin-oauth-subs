/**
 * Quota across stored accounts: live-session resolution (stale imported
 * logins carry their reason), per-account quota hydration with the identity
 * write-backs it triggers, the Settings refresh RPC, and reset-card spending.
 */
import type { AuthController } from './controller.js';
export declare function liveAccounts(ctl: AuthController, provider: any): Promise<any[]>;
export declare function ensureAccountQuota(ctl: AuthController, provider: any, revalidateQuota?: boolean): Promise<any[]>;
export declare function accountsWithQuota(ctl: AuthController, provider: any): Promise<({
    quota: {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
    id: string;
    active: boolean;
} | {
    quota: {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
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
    id: string;
    active: boolean;
} | {
    quota: {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
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
    id: string;
    active: boolean;
} | {
    quota: {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
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
    id: string;
    active: boolean;
} | {
    quota: {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
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
    id: string;
    active: boolean;
} | {
    quota: {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
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
    id: string;
    active: boolean;
} | {
    quota: {
        status: string;
        planType?: undefined;
        planLabel?: undefined;
        account?: undefined;
        subscriptionStatus?: undefined;
        hasGrokCodeAccess?: undefined;
        updatedAt?: undefined;
        error?: undefined;
        rows?: undefined;
        resetCredits?: undefined;
    } | {
        status: any;
        planType: any;
        planLabel: any;
        account: any;
        subscriptionStatus: any;
        hasGrokCodeAccess: any;
        updatedAt: any;
        error: any;
        rows: any;
        resetCredits: {
            nextExpiresAt?: any;
            availableCount: any;
            credits: any;
        };
    };
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
    id: string;
    active: boolean;
})[]>;
export declare function refreshQuota(ctl: AuthController, provider: any, accountId?: any): any;
export declare function consumeReset(ctl: AuthController, provider: any, accountId: any, creditId?: any): Promise<any>;
