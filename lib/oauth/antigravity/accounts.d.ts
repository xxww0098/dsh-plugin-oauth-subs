/**
 * Antigravity account lifecycle for AuthController: plan write-back and the Google validation probe.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import type { AuthController } from '../controller.js';
export declare function rememberAntigravityPlan(ctl: AuthController, row: any, quota: any): Promise<void>;
export declare function probeAntigravity(ctl: AuthController, source: any): Promise<void>;
