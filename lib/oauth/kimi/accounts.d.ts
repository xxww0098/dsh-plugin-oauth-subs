/**
 * Kimi account lifecycle for AuthController: live catalog discovery, local Kimi Code
 * auto-import, identity, and device-code completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function discoverKimi(ctl: AuthController, session: any): Promise<any>;
export declare function maybeAutoImportKimi(ctl: AuthController): Promise<void>;
export declare function importKimi(ctl: AuthController): Promise<{
    source: any;
    session: any;
    skipped: boolean;
} | {
    session: any;
    source: string;
    skipped?: undefined;
}>;
export declare function finishKimiSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberKimiIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function completeKimiDevice(ctl: AuthController, attempt: any): Promise<void>;
