/**
 * Kimi account lifecycle for AuthController: device login start and completion,
 * pasted keys, live catalog discovery, local Kimi Code auto-import, and identity.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function discoverKimi(ctl: AuthController, session: any): Promise<any>;
export declare function maybeAutoImportKimi(ctl: AuthController): Promise<void>;
export declare function importKimi(ctl: AuthController): Promise<{
    source: unknown;
    session: import("../store.js").StoredSession;
    skipped: boolean;
} | {
    session: any;
    source: string;
    skipped?: undefined;
}>;
export declare function finishKimiSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberKimiIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function completeKimiDevice(ctl: AuthController, attempt: any): Promise<void>;
export declare function loginKimi(ctl: AuthController): Promise<{
    authorizeUrl: any;
    verificationUri: any;
    userCode: any;
    mode: string;
}>;
export declare function useKimiKey(ctl: AuthController, key: any): Promise<{
    account: Record<string, unknown> | undefined;
}>;
