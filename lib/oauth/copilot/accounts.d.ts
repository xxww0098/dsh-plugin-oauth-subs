/**
 * Copilot account lifecycle for AuthController: live catalog discovery, hosts.json
 * auto-import, session minting from the GitHub token, identity, and device-code
 * completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function discoverCopilot(ctl: AuthController, session: any): Promise<any>;
export declare function maybeAutoImportCopilot(ctl: AuthController): Promise<void>;
export declare function importCopilot(ctl: AuthController): Promise<{
    source: any;
    session: any;
    skipped: boolean;
} | {
    session: any;
    source: string;
    skipped?: undefined;
}>;
export declare function finishCopilotSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberCopilotIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function completeCopilotDevice(ctl: AuthController, attempt: any): Promise<void>;
