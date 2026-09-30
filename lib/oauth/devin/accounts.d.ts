/**
 * Devin account lifecycle for AuthController: live catalog discovery, credentials.toml
 * auto-import, and identity.
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
