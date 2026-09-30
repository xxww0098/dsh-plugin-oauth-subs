/**
 * Sign in with ChatGPT — the official open-source client flow
 * (developers.openai.com/siwc/token-sharing-open-source).
 *
 * First sign-in registers a user/workspace-bound client with
 * `client_id=dynamic_agent_client`; the callback returns the issued
 * `oaiapp_…` client id, which every later exchange, refresh, revocation and
 * reauthorization uses. The resulting access token is a Bearer for the public
 * Responses API (`api.openai.com/v1/responses`) — never chatgpt.com
 * `backend-api`. No client secret, no partner key.
 *
 * Mirrors earendil-works/pi `auth/oauth/openai-chatgpt.ts`, openclaw
 * `extensions/openai/token-sharing-oauth.runtime.ts` and pingdotgg/t3code
 * `CodexChatGptAuth.ts` (see README 归因).
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare const CHATGPT_ISSUER = "https://auth.openai.com";
export declare const CHATGPT_AUTHORIZE_URL = "https://auth.openai.com/api/accounts/authorize";
export declare const CHATGPT_TOKEN_URL = "https://auth.openai.com/api/accounts/oauth/token";
export declare const CHATGPT_REVOKE_URL = "https://auth.openai.com/api/accounts/oauth/revoke";
export declare const CHATGPT_JWKS_URL = "https://auth.openai.com/.well-known/jwks.json";
export declare const CHATGPT_RESOURCE = "https://api.openai.com/v1";
export declare const CHATGPT_RESPONSES_URL = "https://api.openai.com/v1/responses";
export declare const CHATGPT_MODELS_URL = "https://api.openai.com/v1/models";
export declare const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";
/** First-registration entrypoint only — never saved, never used for exchange. */
export declare const CHATGPT_DYNAMIC_CLIENT_ID = "dynamic_agent_client";
/** Display metadata the user may edit on the consent page; kept constant across installs. */
export declare const CHATGPT_AGENT_NAME = "DSH OAuth Subs";
export declare const CHATGPT_DIRECT_SCOPE = "chatgpt.tokens.use.direct";
export declare const CHATGPT_SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export declare const CHATGPT_CALLBACK_PATH = "/auth/callback";
/** Access tokens live one hour; refresh like the other hourly families. */
export declare const CHATGPT_PREEMPT_MS: number;
/** Refresh codes that mean the token set is dead (siwc errors-and-recovery, Refresh errors). */
export declare const CHATGPT_PERMANENT_REFRESH_CODES: string[];
/**
 * Static floor until the account's own `GET /v1/models` answers (catalog.ts).
 * Rows live in `src/catalog/models.json` under `"chatgpt"`; provenance in README.
 */
export declare const CHATGPT_MODELS: readonly any[];
export declare function chatgptModel(modelId: any): any;
/**
 * Loopback spec for OAuthFlowManager. `127.0.0.1` from the first registration
 * on (never `localhost`); only the port may vary between sign-ins, path stays
 * `/auth/callback`. The callback carries the issued client id beside `code`,
 * so `collect` hands both to the completion step, which validates them.
 */
export declare function chatgptFlow({ hostId, clientId, idTokenHint, loginHint, forceConsent }: any): {
    callbackPath: string;
    listen: {
        host: string;
        ports: number[];
    };
    nonce: any;
    registering: boolean;
    clientId: any;
    buildAuthorizeUrl({ redirectUri, state, pkce }: {
        redirectUri: any;
        state: any;
        pkce: any;
    }): string;
    collect(url: any): {
        code: any;
        clientIds: any;
    } | undefined;
};
/**
 * The client id this attempt must exchange with. A new registration must
 * return exactly one issued `oaiapp_` id; a reauthorization may omit it but
 * can never replace the selected registration's id.
 */
export declare function chatgptCallbackClientId(result: any, { registering, clientId }: {
    registering: any;
    clientId: any;
}): any;
/**
 * Token response → stored session. `previous` is the session a refresh
 * rotates: refresh may omit the unchanged ID token or scope, but never the
 * access token, the rotating refresh token or the expiry.
 */
export declare function chatgptSession(tokens: any, { clientId, hostId, subject, previous }: any): {
    earliestRefreshAt?: number | undefined;
    accountKey?: any;
    planType?: any;
    emailAddress?: any;
    account?: any;
    clientId: any;
    hostId: any;
    subject: any;
    scopes: any[];
    idToken?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
};
/**
 * Verify a sign-in ID token: RS256 signature against OpenAI's published JWKS,
 * issuer, audience = the issued client id, expiry and this attempt's nonce.
 * Returns the verified payload; `sub` is the (client-scoped) account identity.
 */
export declare function verifyChatgptIdToken(idToken: any, { clientId, nonce, fetchFn, now }: any): Promise<any>;
/**
 * Authorization-code exchange + identity check → `{ tokens, identity }`.
 * `expectedSubject` is set on a reauthorization: the new identity must be
 * the selected registration's. The session is built separately
 * (`chatgptSession`) so a grant without plan use still keeps its registration.
 */
export declare function redeemChatgptCode({ code, verifier, redirectUri, clientId, nonce, expectedSubject, fetchFn }: any): Promise<{
    tokens: any;
    identity: any;
}>;
/** Whether a token response grants ChatGPT plan use (a valid ID token alone does not). */
export declare function chatgptPlanUseGranted(tokens: any): boolean;
/** No quota endpoint exists for this flow; usage lives in ChatGPT Settings → Usage. */
export declare function chatgptQuota(session: any): {
    rows: never[];
    account?: any;
    planType?: any;
};
/** Rotating refresh with the issued client id; omit `scope` to keep the grant. */
export declare function refreshChatgpt(session: any, fetchFn?: typeof outboundFetch): Promise<{
    earliestRefreshAt?: number | undefined;
    accountKey?: any;
    planType?: any;
    emailAddress?: any;
    account?: any;
    clientId: any;
    hostId: any;
    subject: any;
    scopes: any[];
    idToken?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
}>;
/**
 * End the renewable session. Empty HTTP 200 is success (also for an already
 * invalid token); network errors and 5xx retry with backoff. Resolves whether
 * revocation was confirmed — local sign-out proceeds either way.
 */
export declare function revokeChatgpt(session: any, { fetchFn, attempts, sleep }?: any): Promise<boolean>;
export declare function chatgptUpstreamHeaders(session: any): {
    authorization: string;
    accept: string;
};
