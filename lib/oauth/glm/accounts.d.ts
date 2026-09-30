/**
 * GLM account lifecycle for AuthController: identity re-resolution and CLI login completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function resolveGlmIdentities(ctl: AuthController): Promise<void>;
export declare function completeGlm(ctl: AuthController, attempt: any): Promise<void>;
