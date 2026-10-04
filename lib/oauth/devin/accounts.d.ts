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
    source: unknown;
    session: import("../store.js").StoredSession;
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
    account: Record<string, unknown> | undefined;
}>;
