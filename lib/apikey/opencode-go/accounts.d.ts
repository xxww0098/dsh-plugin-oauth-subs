/**
 * OpenCode Go accounts for AuthController: the multi-account vault, the
 * mirrored host `OPENCODE_API_KEY` credential, and the Settings payload.
 */
import type { AuthController } from '../../oauth/controller.js';
export declare function hasOpencodeGoCredential(ctl: AuthController): Promise<boolean>;
export declare function hasOpencodeGoKey(ctl: AuthController): Promise<boolean>;
/** Adopt a pre-multi-account key from the host credential into the vault, once. */
export declare function maybeAdoptOpencodeGoKey(ctl: AuthController): Promise<void>;
/**
 * Mirror a stored account's key into the host `OPENCODE_API_KEY` credential.
 * A keyless account never clears a key another stored account still holds
 * (a quota-only account must keep chat working); once no stored account has
 * a key, the credential is removed so the next `sync()` can take the
 * plugin's `opencode-go-flash` route back out of DSH.
 */
export declare function mirrorOpencodeGoKey(ctl: AuthController, id: any): Promise<void>;
export declare function opencodeGoSnapshot(ctl: AuthController, options?: any): Promise<{
    id: string;
    loggedIn: boolean;
    busy: boolean;
    activeId: any;
    accounts: any;
    cookieSet: boolean;
    workspaceId: any;
    apiKeySet: boolean;
    configured: boolean;
    quota: any;
}>;
export declare function saveOpencodeGo(ctl: AuthController, payload?: any): Promise<{
    id: string;
    loggedIn: boolean;
    busy: boolean;
    activeId: any;
    accounts: any;
    cookieSet: boolean;
    workspaceId: any;
    apiKeySet: boolean;
    configured: boolean;
    quota: any;
}>;
export declare function switchOpencodeGo(ctl: AuthController, id: any): Promise<{
    id: string;
    loggedIn: boolean;
    busy: boolean;
    activeId: any;
    accounts: any;
    cookieSet: boolean;
    workspaceId: any;
    apiKeySet: boolean;
    configured: boolean;
    quota: any;
}>;
export declare function logoutOpencodeGo(ctl: AuthController, id: any): Promise<{
    id: string;
    loggedIn: boolean;
    busy: boolean;
    activeId: any;
    accounts: any;
    cookieSet: boolean;
    workspaceId: any;
    apiKeySet: boolean;
    configured: boolean;
    quota: any;
}>;
export declare function clearOpencodeGo(ctl: AuthController, field: any, id: any): Promise<{
    id: string;
    loggedIn: boolean;
    busy: boolean;
    activeId: any;
    accounts: any;
    cookieSet: boolean;
    workspaceId: any;
    apiKeySet: boolean;
    configured: boolean;
    quota: any;
}>;
export declare function refreshOpencodeGoQuota(ctl: AuthController, id: any): Promise<{
    id: string;
    loggedIn: boolean;
    busy: boolean;
    activeId: any;
    accounts: any;
    cookieSet: boolean;
    workspaceId: any;
    apiKeySet: boolean;
    configured: boolean;
    quota: any;
}>;
