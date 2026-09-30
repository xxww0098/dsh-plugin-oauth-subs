/**
 * Per-account bookkeeping outside the credential store: the signed-out list
 * that keeps auto-import from reviving a family the user left, and the
 * identity-lookup throttle for the snapshot poll.
 */
import type { AuthController } from './controller.js';
export declare function signedOutFile(ctl: AuthController): string;
export declare function signedOut(ctl: AuthController): Promise<string[]>;
export declare function signedOutOf(ctl: AuthController, provider: any): Promise<boolean>;
export declare function markSignedOut(ctl: AuthController, provider: any): Promise<void>;
/**
 * Rows still missing a readable identity, minus those tried within the
 * passive quota TTL — the snapshot poll must not re-hit userinfo / state.vscdb
 * every tick. `onAuthChanged` clears the table.
 */
export declare function identityDue(ctl: AuthController, provider: any, rows: any, hasIdentity: any): any;
