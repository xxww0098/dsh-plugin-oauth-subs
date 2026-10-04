/**
 * Antigravity local-session import: a user who has already logged in on this
 * machine does not have to repeat the browser flow.
 *
 * Recognised files:
 *   ~/.gemini/antigravity-cli/antigravity-oauth-token
 *   ~/.cli-proxy-api/antigravity.json   (CLIPROXYAPI_AUTH_DIR / CLI_PROXY_API_AUTH_DIR)
 *   antigravity*.json in the cli-proxy-api / ~/.gemini/antigravity directories
 */
export declare function antigravityAuthSearchPaths(): string[];
export declare function importAntigravityAuth({ paths, fetchFn }?: any): Promise<{
    session: {
        validationUrl?: string | undefined;
        needsValidation?: boolean | undefined;
        planType?: any;
        accessToken: any;
        refreshToken: any;
        expiresAt: number;
        account: string;
        projectId: any;
    };
    source: any;
}>;
