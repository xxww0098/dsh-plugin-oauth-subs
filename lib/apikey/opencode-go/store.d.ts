/**
 * OpenCode Go multi-account vault at <dataDir>/opencode-go.json (0600).
 *
 * Not auth.json: the OAuth store requires accessToken / refreshToken /
 * expiresAt. Each account carries its own chat key plus the web cookie and
 * workspace id used to read quota; the controller mirrors the active
 * account's key into the host `OPENCODE_API_KEY` credential. Nothing in
 * this file is ever returned to Settings verbatim.
 */
export declare function opencodeGoFilePath(authPath: any): string;
/** Parse a vault file; a pre-multi-account `{ cookieHeader, workspaceId }` migrates in place. */
export declare function parseOpencodeGoVault(text: any): {
    activeId: any;
    accounts: {};
};
export declare class OpencodeGoStore {
    #private;
    constructor({ path, fetchFn, ttlMs }?: {
        fetchFn?: typeof fetch;
        ttlMs?: number;
    });
    activeId(): any;
    keyOf(id: any): any;
    anyKey(): boolean;
    /** The single keyless account, if the vault holds exactly one (legacy adoption). */
    keylessId(): string;
    adoptKey(id: any, key: any): Promise<boolean>;
    snapshot({ refresh, id }?: {
        refresh?: boolean;
    }): Promise<{
        id: string;
        activeId: any;
        accounts: {
            id: any;
            active: boolean;
            account: string;
            workspaceId: string;
            cookieSet: boolean;
            apiKeySet: boolean;
            quota: any;
        }[];
    }>;
    save({ id, apiKey, cookie, workspace }?: {}): Promise<{
        id: string;
        created: boolean;
    }>;
    switch(id: any): Promise<{
        id: string;
        activeId: any;
        accounts: {
            id: any;
            active: boolean;
            account: string;
            workspaceId: string;
            cookieSet: boolean;
            apiKeySet: boolean;
            quota: any;
        }[];
    }>;
    remove(id: any): Promise<{
        removed: string;
        wasActive: boolean;
        activeId: any;
    }>;
    clear(id: any, field: any): Promise<{
        id: string;
        activeId: any;
        accounts: {
            id: any;
            active: boolean;
            account: string;
            workspaceId: string;
            cookieSet: boolean;
            apiKeySet: boolean;
            quota: any;
        }[];
    }>;
    refreshQuota(id: any): Promise<{
        id: string;
        activeId: any;
        accounts: {
            id: any;
            active: boolean;
            account: string;
            workspaceId: string;
            cookieSet: boolean;
            apiKeySet: boolean;
            quota: any;
        }[];
    }>;
}
