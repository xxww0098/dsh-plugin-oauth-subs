/**
 * Anthropic subscription OAuth (Claude Pro/Max), pinned to the Claude Code
 * client identity as observed in senpi/pi-ai (`@earendil-works/pi-ai`
 * `auth/oauth/anthropic.js` + `api/anthropic-messages.js`, engine of
 * oh-my-openagent) and cross-checked against Claude Code's documented flow:
 *
 *   - PKCE (S256) at claude.ai/oauth/authorize, client id
 *     `9d1c250a-e61b-44e9-88ed-594fedd33385`, loopback `/callback`
 *     (Claude Code binds a random port; the client accepts any localhost
 *     port, so we reuse the shared flow manager's listener).
 *   - Token exchange + refresh POST JSON to
 *     platform.claude.com/v1/oauth/token (the console.anthropic.com host is
 *     the legacy spelling).
 *   - Chat: api.anthropic.com/v1/messages with `Authorization: Bearer
 *     sk-ant-oat…`, `anthropic-beta: claude-code-20250219, oauth-2025-04-20`,
 *     `user-agent: claude-cli/<version>`, `x-app: cli`.
 *   - Account identity: GET api.anthropic.com/api/oauth/profile
 *     (`user:profile` scope) — account uuid + email, community-documented
 *     from Claude Code's own post-login call.
 *   - Usage: GET api.anthropic.com/api/oauth/usage — present in the pinned CLI
 *     and live-verified for scoped weekly model limits.
 *
 * Do not invent: scopes, beta headers, dated model rows, or unverified endpoints —
 * see README.md for the do-not list.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44e9-88ed-594fedd33385";
export declare const ANTHROPIC_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
export declare const ANTHROPIC_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
export declare const ANTHROPIC_API_BASE = "https://api.anthropic.com";
export declare const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export declare const ANTHROPIC_PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
export declare const ANTHROPIC_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
export declare const ANTHROPIC_CALLBACK_PATH = "/callback";
/**
 * Claude Code's scopes at the time of pinning (pi-ai `SCOPES`). `user:profile`
 * backs the profile lookup; `user:inference` is the chat grant.
 */
export declare const ANTHROPIC_SCOPE = "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";
/** Claude Code identity the OAuth lane must present (pi-ai `claudeCodeVersion`). */
export declare const ANTHROPIC_CLI_VERSION = "2.1.280";
export declare const ANTHROPIC_USER_AGENT = "claude-cli/2.1.280";
/** Beta features the subscription lane requires; order mirrors pi-ai. */
export declare const ANTHROPIC_BETA = "claude-code-20250219,oauth-2025-04-20";
/** pi-ai reserves a 5-minute refresh window on the returned expiry. */
export declare const ANTHROPIC_PREEMPT_MS: number;
export declare const ANTHROPIC_TEXT_INPUT: readonly string[];
/**
 * The OAuth token is opaque (`sk-ant-oat01-…`): no JWT claims, no account id.
 * Identity comes from the profile endpoint; without it the generic
 * refresh-token-suffix id applies (store.accountIdOf).
 */
export declare function isAnthropicOAuthToken(value: any): boolean;
export declare const anthropicFlow: {
    callbackPath: string;
    listen: {
        host: string;
    };
    buildAuthorizeUrl({ redirectUri, state, pkce }: {
        redirectUri: any;
        state: any;
        pkce: any;
    }): string;
};
/**
 * The token exchange echoes `state` (pi-ai posts it; Claude Code sends it) —
 * completePkce passes the flow manager's own state back in.
 */
export declare function exchangeAnthropicCode(code: any, verifier: any, redirectUri: any, state: any, fetchFn?: typeof outboundFetch): Promise<{
    planType?: any;
    accountId?: any;
    account?: any;
    scope?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
}>;
export declare function refreshAnthropic(session: any, fetchFn?: typeof outboundFetch): Promise<{
    planType?: any;
    accountId?: any;
    account?: any;
    scope?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
}>;
export declare function anthropicSession(tokens: any, fallback?: any): {
    planType?: any;
    accountId?: any;
    account?: any;
    scope?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
};
/**
 * Account uuid + email from the `user:profile` grant. Best-effort: a profile
 * failure must not kill a finished login (the vault falls back to the
 * refresh-token-suffix id and the card shows the token shape).
 */
export declare function anthropicProfile(session: any, fetchFn?: typeof outboundFetch): Promise<{
    email: any;
    uuid: any;
    organization: any;
}>;
/**
 * Headers every subscription-lane request must carry. The OAuth token is only
 * accepted with the claude-code + oauth beta pair and the claude-cli
 * identity; `anthropic-version` pins the Messages API revision the lane
 * targets (pi-ai sends the SDK default `2023-06-01`).
 */
export declare function anthropicUpstreamHeaders(session: any): {
    authorization: string;
    'anthropic-version': string;
    'anthropic-beta': string;
    'user-agent': string;
    'x-app': string;
    accept: string;
};
/**
 * Offline fallback matching pi-ai's `providers/data/anthropic.json` catalog
 * (the Claude Code subscription set) cross-checked against our Kiro family
 * rows for the same underlying models. Dash ids are the api.anthropic.com
 * spellings (Kiro's dotted ids are that platform's aliasing). Adaptive
 * thinking (output_config.effort) is auto-detected by the host from the same
 * id markers pi-ai uses, so classic-thinking rows (opus-4-5, sonnet-4-5,
 * haiku-4-5) carry no reasoningEfforts and keep native budget thinking.
 * Ladders mirror Kiro's: Opus 5 / 4.8 / 4.7 / Sonnet 5 / Fable add `xhigh`;
 * the 4.6 family stops at `max`.
 */
export declare const ANTHROPIC_REASONING_CLAUDE: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
    max: "max";
}>;
export declare const ANTHROPIC_REASONING_CLAUDE_XHIGH: Readonly<{
    xhigh: "xhigh";
    low: "low";
    medium: "medium";
    high: "high";
    max: "max";
}>;
export declare const ANTHROPIC_CONTEXT_WINDOW = 200000;
export declare const ANTHROPIC_LARGE_CONTEXT = 1000000;
export declare const ANTHROPIC_MAX_TOKENS = 64000;
export declare const ANTHROPIC_LARGE_MAX_TOKENS = 128000;
export declare const ANTHROPIC_MODELS: readonly {
    reasoningEfforts?: any;
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: readonly string[];
}[];
/** Cheapest served row — the quota probe's model. */
export declare const ANTHROPIC_PROBE_MODEL = "claude-haiku-4-5";
