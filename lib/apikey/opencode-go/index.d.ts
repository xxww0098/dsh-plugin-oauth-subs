/**
 * OpenCode Go API-key family (quota only).
 *
 * Chat is DSH's builtin opencode-go + OPENCODE_API_KEY (Responses, no
 * loopback hop). This module stores a web session cookie + workspace id
 * so Settings can show remaining quota.
 *
 * Many accounts share the one OPENCODE_API_KEY env: the vault keeps each
 * account's key, and the controller mirrors the active account's key into
 * the host credential so DSH keeps reading a single ref.
 */
export declare const OPENCODE_GO_ID = "opencode-go";
export declare const OPENCODE_GO_ORIGIN = "https://opencode.ai";
export declare const OPENCODE_GO_RESPONSES_URL = "https://opencode.ai/zen/go/v1";
export declare const OPENCODE_GO_COOKIE_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
export declare function parseOpencodeGoCookie(raw: any): string;
export declare function normalizeOpencodeGoWorkspaceId(raw: any): string;
/** Stable account id: workspace when known, else a hash of the secret. */
export declare function opencodeGoAccountId({ workspaceId, apiKey, cookieHeader }?: {}): string;
/** Masked identity for a keyed account that has no workspace id yet. */
export declare function opencodeGoKeyHint(apiKey: any): string;
export declare function publicOpencodeGoAccount(id: any, entry: any, quota: any, active: any): {
    id: any;
    active: boolean;
    account: string;
    email: string;
    workspaceId: string;
    workspaceName: string;
    cookieSet: boolean;
    apiKeySet: boolean;
    quota: any;
};
export declare function publicOpencodeGo(vault: any, quotas: any): {
    id: string;
    activeId: any;
    accounts: {
        id: any;
        active: boolean;
        account: string;
        email: string;
        workspaceId: string;
        workspaceName: string;
        cookieSet: boolean;
        apiKeySet: boolean;
        quota: any;
    }[];
};
export declare function isOpencodeGoCookieMask(value: any): boolean;
