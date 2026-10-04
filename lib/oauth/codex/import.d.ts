/**
 * Codex CLI / Hermes local-session import: a user who has already logged in
 * on this machine does not have to repeat the browser flow.
 *
 * Recognised files:
 *   ~/.codex/auth.json          Codex CLI
 *   ~/.hermes/auth.json         Hermes multi-provider store
 */
export declare function importCodexAuth(): Promise<{
    session: {
        source: any;
        planType?: any;
        emailAddress?: any;
        idToken?: any;
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        accountId: any;
    };
    source: string;
}>;
/** Codex CLI / Hermes imports carry their file path; PKCE logins carry none. */
export declare const codexImported: {
    cli: string;
    is: (session: any) => boolean;
    reread: (session: any) => Promise<{
        source: any;
        planType?: any;
        emailAddress?: any;
        idToken?: any;
        accessToken: any;
        refreshToken: any;
        expiresAt: any;
        accountId: any;
    } | undefined>;
    identity: (session: any) => any;
};
