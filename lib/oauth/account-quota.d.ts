/**
 * Quota across stored accounts: live-session resolution (stale imported
 * logins carry their reason), per-account quota hydration with the identity
 * write-backs it triggers, the Settings refresh RPC, and reset-card spending.
 */
import type { AuthController } from './controller.js';
export declare function liveAccounts(ctl: AuthController, provider: any): Promise<any[]>;
export declare function ensureAccountQuota(ctl: AuthController, provider: any, revalidateQuota?: boolean): Promise<any[]>;
export declare function accountsWithQuota(ctl: AuthController, provider: any): Promise<{
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
        planLabel: string | undefined;
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
}[]>;
export declare function refreshQuota(ctl: AuthController, provider: any, accountId?: any): any;
export declare function consumeReset(ctl: AuthController, provider: any, accountId: any, creditId?: any): Promise<any>;
