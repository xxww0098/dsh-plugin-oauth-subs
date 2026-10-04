/**
 * Cline account lifecycle for AuthController: device login start, live catalog
 * discovery, local CLI auto-import, identity, and the two-hop device-code completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function discoverCline(ctl: AuthController, session: any): Promise<any>;
export declare function maybeAutoImportCline(ctl: AuthController): Promise<void>;
export declare function importCline(ctl: AuthController): Promise<{
    source: any;
    session: any;
    skipped: boolean;
} | {
    session: any;
    source: string;
    skipped?: undefined;
}>;
export declare function finishClineSession(ctl: AuthController, session: any): Promise<any>;
export declare function rememberClineIdentity(ctl: AuthController, row: any, quota: any): Promise<void>;
/**
 * Cline login is two hops: the WorkOS device poll yields a WorkOS token
 * pair, and `/api/v1/auth/register` exchanges it for the Cline session
 * (`usr-…` account id + refresh token). Only the second hop produces
 * something this plugin can use.
 */
export declare function completeClineDevice(ctl: AuthController, attempt: any): Promise<void>;
export declare function loginCline(ctl: AuthController): Promise<{
    authorizeUrl: any;
    verificationUri: any;
    userCode: any;
    mode: string;
}>;
