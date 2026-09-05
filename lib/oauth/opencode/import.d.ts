/**
 * OpenCode Go Free import is OPENCODE_API_KEY / OPENCODE_GO_API_KEY only.
 *
 * Official CLI `/connect` pastes a key from https://opencode.ai/auth.
 * There is no local credential file to harvest. Never write back to
 * the user's OpenCode CLI store. Auto-import only when the roster is
 * empty. Never overwrite a stored session.
 */
export declare const OPENCODE_IMPORT_EMPTY = "opencode-import-empty";
export declare function resolveOpencodeLocalCredentials({ env }?: {
    env?: NodeJS.ProcessEnv;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    source: string;
    planType: string;
}>;
export declare function importOpencodeAuth(options?: {}): Promise<{
    source: string;
    session: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        account: string;
        source: string;
        planType: string;
    };
}>;
