/**
 * Command Code account lifecycle for AuthController: auth.json auto-import, whoami identity, and
 * the loopback-callback login completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../../oauth/controller.js';
export declare function maybeAutoImportCommandCode(ctl: AuthController): Promise<void>;
export declare function importCommandCode(ctl: AuthController): Promise<{
    source: any;
    session: any;
    skipped: boolean;
} | {
    session: any;
    source: string;
    skipped?: undefined;
}>;
export declare function finishCommandCodeSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberCommandCodeIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
/**
 * Command Code's waitCode resolves with the callback credentials
 * {apiKey,userId,userName,keyName} — the session builds directly, there is
 * no token exchange (flow.ts collect() already state-checked the callback).
 */
export declare function completeCommandCode(ctl: AuthController, attempt: any, claim: any): Promise<void>;
