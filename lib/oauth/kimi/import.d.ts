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
    planType?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: any;
} | undefined;
export declare function resolveKimiCliCredentials(options?: any): Promise<{
    planType?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: any;
} | undefined>;
export declare function resolveKimiEnvKey({ env }?: {
    env?: NodeJS.ProcessEnv | undefined;
}): {
    planType?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: any;
} | undefined;
export declare function importKimiAuth(options?: any): Promise<{
    source: string;
    session: {
        planType?: string | undefined;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
        tokenEndpoint: string;
        clientId: string;
        account: string;
        source: any;
    };
}>;
