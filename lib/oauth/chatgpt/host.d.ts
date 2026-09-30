/**
 * Per-installation Sign in with ChatGPT state, beside auth.json:
 *
 * - `hostId` — the stable, opaque `ext_agent_host_id` (`urn:uuid:<v4>`),
 *   chosen once before the first sign-in and reused for every later one.
 * - `registrations` — issued client id → verified account (subject, email,
 *   vault key). Kept after sign-out or a dead refresh token so the next
 *   sign-in reauthorizes the same registration instead of registering a new
 *   client. Holds no token.
 */
export declare function isChatgptHostId(value: any): boolean;
/** The persisted host id; minted (UUIDv4, `urn:uuid:`) and saved on first use. */
export declare function ensureChatgptHostId(authPath: any): Promise<any>;
export declare function chatgptRegistrations(authPath: any): Promise<{
    clientId: any;
    subject: any;
    email: any;
    accountKey: any;
}[]>;
export declare function chatgptRegistration(authPath: any, clientId: any): Promise<{
    clientId: any;
    subject: any;
    email: any;
    accountKey: any;
} | undefined>;
export declare function rememberChatgptRegistration(authPath: any, { clientId, subject, email, accountKey }: {
    clientId: any;
    subject: any;
    email: any;
    accountKey: any;
}): Promise<void>;
