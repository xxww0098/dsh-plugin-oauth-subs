/**
 * Sign in with ChatGPT account lifecycle for AuthController: start (register or
 * reauthorize), callback completion, sign-out with revocation, and live
 * catalog discovery. Functions take the controller as their first argument.
 */
import type { AuthController } from '../controller.js';
import { chatgptRegistrations } from './host.js';
/** Vault key: email for people, plus a short client hash so two workspaces on one email stay apart. */
export declare function chatgptAccountKey(email: any, clientId: any): string;
export declare function discoverChatgpt(ctl: AuthController, session: any): Promise<any>;
/**
 * `payload.account` (a vault id) reconnects that registration: its issued
 * client id, the stored ID token as `id_token_hint` and email as
 * `login_hint`. Anything else registers a new client with
 * `dynamic_agent_client` unless a signed-out registration can be reused.
 * `payload.mode === 'consent'` re-asks for plan use.
 */
export declare function loginChatgpt(ctl: AuthController, payload?: any): Promise<{
    authorizeUrl: any;
    redirectUri: any;
    mode: string;
    registering: any;
}>;
export declare function completeChatgpt(ctl: AuthController, attempt: any, claim: any): Promise<void>;
/**
 * Revoke the renewable session before local sign-out; an unconfirmed
 * revocation still signs out and says so. The registration is kept.
 */
export declare function revokeChatgptAccounts(ctl: AuthController, id: any): Promise<boolean>;
export { chatgptRegistrations };
