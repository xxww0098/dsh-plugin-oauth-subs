/**
 * GLM account lifecycle for AuthController: CLI login start and completion,
 * pasted API keys, identity re-resolution, and legacy bearer upgrades.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function resolveGlmIdentities(ctl: AuthController): Promise<void>;
/**
 * Sessions written before the issue #168 fix carry BigModel's OAuth business
 * token in the bearer slot — it 500s on the Coding Plan hop and the direct
 * fallback's 401/500 chain never reaches a forced token refresh, so the sweep
 * here is the only reliable upgrade moment. The poll OAuth token doubles as
 * the BigModel biz bearer, so this is the same mint the login path does;
 * tried once per account per process, and a failed mint keeps the legacy
 * bearer (identity/quota still work; chat is no worse than before the fix).
 */
export declare function upgradeGlmLegacyBearers(ctl: AuthController): Promise<void>;
export declare function completeGlm(ctl: AuthController, attempt: any): Promise<void>;
export declare function loginGlm(ctl: AuthController, payload?: any): Promise<{
    authorizeUrl: any;
    mode: string;
    region: string;
}>;
export declare function useGlmKey(ctl: AuthController, key: any, payload?: any): Promise<{
    region: string;
}>;
