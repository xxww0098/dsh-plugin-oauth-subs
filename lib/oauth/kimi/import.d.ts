/**
 * Import official Kimi Code CLI credentials.
 *
 *   ~/.kimi-code/credentials/kimi-code.json
 *   ~/.kimi/credentials/kimi-code.json   (read-only fallback)
 *
 * Optional KEY source: KIMI_API_KEY / pasted sk- (no refresh).
 * Auto-import only the CLI json, and only when the roster is empty.
 * Never overwrite a stored session. Never write back to ~/.kimi-code.
 */
export declare const KIMI_IMPORT_EMPTY = "kimi-import-empty";
export declare function kimiSessionFromCliFile(data: any): {
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
};
export declare function resolveKimiCliCredentials(options?: {}): Promise<{
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
}>;
export declare function resolveKimiEnvKey({ env }?: {
    env?: NodeJS.ProcessEnv;
}): {
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
};
export declare function importKimiAuth(options?: {}): Promise<{
    source: string;
    session: {
        planType?: string;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        tokenEndpoint: string;
        clientId: string;
        account: string;
        source: string;
    };
}>;
