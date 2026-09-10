/**
 * OpenCode Go API-key family (quota only).
 *
 * Chat is DSH's builtin opencode-go + OPENCODE_API_KEY (Responses, no
 * loopback hop). This module stores a web session cookie + workspace id
 * so Settings can show remaining quota.
 */
export declare const OPENCODE_GO_ID = "opencode-go";
export declare const OPENCODE_GO_ORIGIN = "https://opencode.ai";
export declare const OPENCODE_GO_RESPONSES_URL = "https://opencode.ai/zen/go/v1";
export declare const OPENCODE_GO_COOKIE_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
export declare function parseOpencodeGoCookie(raw: any): string;
export declare function normalizeOpencodeGoWorkspaceId(raw: any): string;
export declare function publicOpencodeGo(entry: any, quota: any): {
    id: string;
    cookieSet: boolean;
    workspaceId: any;
    configured: boolean;
    quota: any;
};
export declare function isOpencodeGoCookieMask(value: any): boolean;
