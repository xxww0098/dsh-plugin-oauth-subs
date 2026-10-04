/**
 * Cursor account lifecycle for AuthController: login start, live catalog discovery,
 * auto-import from the CLI / IDE, identity from the token or state.vscdb, and plan write-back.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function discoverCursor(ctl: AuthController, session: any): Promise<any>;
export declare function rememberCursorPlan(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function resolveCursorIdentities(ctl: AuthController): Promise<void>;
export declare function cachedEmailFor(ctl: AuthController, session: any, vscdb: any): string | undefined;
export declare function readCursorVscdbHint(ctl: AuthController): Promise<any>;
export declare function rewriteCursorIdentity(ctl: AuthController, row: any, next: any): Promise<void>;
export declare function maybeAutoImportCursor(ctl: AuthController): Promise<void>;
export declare function importCursor(ctl: AuthController): Promise<{
    source: any;
    session: {
        cachedEmail?: string | undefined;
        planType?: any;
        source: any;
        account?: string | undefined;
        accessToken: any;
        refreshToken: any;
        expiresAt: number;
    };
} | {
    source: string;
    session: import("../store.js").StoredSession;
    skipped: boolean;
}>;
export declare function completeCursor(ctl: AuthController, attempt: any): Promise<void>;
export declare function loginCursor(ctl: AuthController): Promise<{
    authorizeUrl: string;
    mode: string;
}>;
