/**
 * OpenCode Go cookie + workspace vault at <dataDir>/opencode-go.json.
 *
 * Not auth.json: the OAuth store requires accessToken / refreshToken /
 * expiresAt. The cookie never leaves this file in the Settings snapshot.
 */
export declare function opencodeGoFilePath(authPath: any): string;
export declare class OpencodeGoStore {
    #private;
    constructor({ path, fetchFn, ttlMs }?: {
        fetchFn?: typeof fetch;
        ttlMs?: number;
    });
    snapshot({ refresh }?: {
        refresh?: boolean;
    }): Promise<{
        id: string;
        cookieSet: boolean;
        workspaceId: any;
        configured: boolean;
        quota: any;
    }>;
    save({ cookie, workspace }?: {}): Promise<{
        id: string;
        cookieSet: boolean;
        workspaceId: any;
        configured: boolean;
        quota: any;
    }>;
    clear(field: any): Promise<{
        id: string;
        cookieSet: boolean;
        workspaceId: any;
        configured: boolean;
        quota: any;
    }>;
    refreshQuota(): Promise<any>;
}
