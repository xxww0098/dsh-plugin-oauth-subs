/**
 * ChatGPT / Codex subscription OAuth.
 *
 * Client id, endpoints, and authorize flags match Codex CLI
 * (`app_EMoamEEZ73f0CkXaXp7hrann`, auth.openai.com, originator
 * `codex_cli_rs`). Token exchange is form-encoded; refresh is JSON.
 */
import { catalogRows } from '../../catalog/index.js';
import { decodeJwtPayload } from '../../utils/jwt.js';
import { outboundFetch } from '../../utils/outbound.js';
import { oauthError } from '../tokens.js';
export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
export const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
export const CODEX_API_URL = 'https://chatgpt.com/backend-api/codex/responses';
export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
export const CODEX_RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits';
export const CODEX_RESET_CONSUME_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume';
export const CODEX_MODELS_URL = 'https://chatgpt.com/backend-api/codex/models';
export const CODEX_CLIENT_VERSION = '0.160.0';
export const CODEX_ORIGINATOR = 'codex_cli_rs';
export const CODEX_USER_AGENT = `${CODEX_ORIGINATOR}/${CODEX_CLIENT_VERSION}`;
export const CODEX_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke';
export const CODEX_CALLBACK_PATH = '/auth/callback';
export const CODEX_PREEMPT_MS = 5 * 60_000;
/** Codex CLI targets ~258K usable input; the raw model window is 272K.
 *  Every catalog row shares this default. */
export const CODEX_CONTEXT_WINDOW = 258_000;
export const CODEX_DEFAULT_MAX_TOKENS = 128_000;
/** Codex token-endpoint codes for a dead refresh token, beyond the shared grant codes. */
export const CODEX_PERMANENT_REFRESH_CODES = [
    'refresh_token_expired',
    'refresh_token_reused',
    'refresh_token_invalidated',
];
/**
 * `reasoning.effort` values the Codex Responses API accepts, probed against
 * chatgpt.com on 2026-08-26. `minimal` is rejected by every Codex model, and
 * `ultra` is a Codex CLI client-side multi-agent mode rather than an API
 * effort — both answer 400 `unsupported_value`.
 */
export const CODEX_REASONING = Object.freeze({
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
});
/** GPT-5.5 stops at `xhigh`. */
export const CODEX_REASONING_EFFORTS = Object.freeze({
    off: null,
    ...CODEX_REASONING,
});
/** GPT-6 Astra / Sol / Luna and GPT-5.6 Sol / Terra / Luna add `max`.
 *  `ultra` is a Codex CLI multi-agent mode, not an API effort — it 400s. */
export const CODEX_REASONING_EFFORTS_56 = Object.freeze({
    ...CODEX_REASONING_EFFORTS,
    max: 'max',
});
/**
 * Mirrors Codex CLI `models.json` plus GET
 * chatgpt.com/backend-api/codex/models (probed 2026-10-03 at `client_version`
 * 0.160.0) — the one place model facts live, so the picker, the context
 * aliases and the Fast tier cannot drift apart. The backend gates rows on
 * `client_version`: `gpt-6-sol` / `gpt-6-luna` appear at >= 0.155.0,
 * `gpt-6.1-sol` at >= 0.159.0 — a stale pin hides new models, hence
 * CODEX_CLIENT_VERSION tracks npm latest.
 *
 * `maxContextWindow` is the row's `max_context_window` and `fastTier` whether its
 * `service_tiers` offers Fast. Models the subscription backend does not serve
 * stay out entirely — `gpt-5.3-codex`, `gpt-5.4`, `gpt-5.4-mini` and
 * `gpt-5.3-codex-spark` all answer 400 "not supported when using Codex with a
 * ChatGPT account", and `gpt-reserve` / Daybreak / auto-review are
 * `visibility: hide` (CLI-internal).
 *
 * Rows live in `src/catalog/models.json` under `"codex"`, validated and
 * frozen by the catalog loader.
 */
export const CODEX_MODELS = catalogRows('codex');
const CODEX_BY_ID = new Map(CODEX_MODELS.map((model) => [model.id, model]));
const SNAPSHOT_SUFFIX = /-\d{4}-\d{2}-\d{2}$/;
/** Bare slug for a model id: no vendor prefix, no `:tag`, lower-cased. */
export function codexSlug(modelId) {
    let raw = String(modelId ?? '').trim();
    if (raw.includes('/'))
        raw = raw.slice(raw.lastIndexOf('/') + 1);
    const colon = raw.indexOf(':');
    if (colon > 0)
        raw = raw.slice(0, colon);
    return raw.toLowerCase();
}
/** Catalog row for a model id, resolving a dated snapshot to its base. */
export function codexModel(modelId) {
    const slug = codexSlug(modelId);
    return CODEX_BY_ID.get(slug) ?? CODEX_BY_ID.get(slug.replace(SNAPSHOT_SUFFIX, ''));
}
export const codexFlow = {
    callbackPath: CODEX_CALLBACK_PATH,
    listen: { host: 'localhost', ports: [1455, 1457] },
    buildAuthorizeUrl({ redirectUri, state, pkce }) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: CODEX_CLIENT_ID,
            redirect_uri: redirectUri,
            scope: CODEX_SCOPE,
            code_challenge: pkce.challenge,
            code_challenge_method: 'S256',
            state,
            id_token_add_organizations: 'true',
            codex_cli_simplified_flow: 'true',
            originator: CODEX_ORIGINATOR,
        });
        return `${CODEX_AUTHORIZE_URL}?${params.toString()}`;
    },
};
function accountIdOf(idToken) {
    const payload = idToken === undefined ? undefined : decodeJwtPayload(idToken);
    const auth = payload?.['https://api.openai.com/auth'];
    const accountId = typeof auth === 'object' && auth !== null
        ? auth.chatgpt_account_id
        : undefined;
    if (typeof accountId !== 'string' || accountId.length === 0) {
        throw new Error('codex login did not return a chatgpt account id; cannot use the subscription');
    }
    return accountId;
}
export function codexProfileClaims(idToken) {
    const payload = idToken === undefined ? undefined : decodeJwtPayload(idToken);
    if (payload === undefined)
        return {};
    const profile = payload['https://api.openai.com/profile'];
    const profileEmail = typeof profile === 'object' && profile !== null ? profile.email : undefined;
    const email = payload.email ?? profileEmail;
    const auth = payload['https://api.openai.com/auth'];
    const plan = typeof auth === 'object' && auth !== null ? auth.chatgpt_plan_type : undefined;
    return {
        ...(typeof email === 'string' && email.length > 0 ? { emailAddress: email } : {}),
        ...(typeof plan === 'string' && plan.length > 0 ? { planType: plan } : {}),
    };
}
export function codexSession(tokens, fallback) {
    if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
        throw new Error('codex token endpoint returned no access token');
    }
    const refreshToken = tokens.refresh_token ?? fallback?.refreshToken;
    if (refreshToken === undefined)
        throw new Error('codex token endpoint returned no refresh token');
    let expiresAt;
    if (typeof tokens.expires_in === 'number' && tokens.expires_in > 0) {
        expiresAt = Date.now() + tokens.expires_in * 1000;
    }
    else {
        const exp = decodeJwtPayload(tokens.access_token)?.exp;
        if (typeof exp === 'number' && exp > 0)
            expiresAt = exp * 1000;
    }
    if (expiresAt === undefined)
        throw new Error('codex token endpoint returned no usable expiry');
    const idToken = tokens.id_token ?? fallback?.idToken;
    const claims = {
        ...(fallback?.emailAddress === undefined ? {} : { emailAddress: fallback.emailAddress }),
        ...(fallback?.planType === undefined ? {} : { planType: fallback.planType }),
        ...codexProfileClaims(tokens.id_token),
    };
    return {
        accessToken: tokens.access_token,
        refreshToken,
        expiresAt,
        accountId: tokens.id_token === undefined && fallback !== undefined
            ? fallback.accountId
            : accountIdOf(tokens.id_token),
        ...(idToken === undefined ? {} : { idToken }),
        ...claims,
    };
}
export async function exchangeCodexCode(code, verifier, redirectUri, fetchFn = outboundFetch) {
    const response = await fetchFn(CODEX_TOKEN_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            ...codexCredentialHeaders(),
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: CODEX_CLIENT_ID,
            code_verifier: verifier,
        }).toString(),
    });
    if (!response.ok)
        throw await oauthError(response, 'codex');
    return codexSession(await response.json());
}
export async function refreshCodex(session, fetchFn = outboundFetch) {
    const response = await fetchFn(CODEX_TOKEN_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...codexCredentialHeaders(),
        },
        body: JSON.stringify({
            client_id: CODEX_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: session.refreshToken,
        }),
    });
    if (!response.ok)
        throw await oauthError(response, 'codex');
    return codexSession(await response.json(), session);
}
/** originator + User-Agent pair the token endpoint and Responses API both expect. */
export function codexCredentialHeaders() {
    return {
        originator: CODEX_ORIGINATOR,
        'user-agent': CODEX_USER_AGENT,
    };
}
/**
 * Codex CLI `x-codex-routing-hint` (openai/codex#37345). ChatGPT Codex
 * subscription Responses use this together with body `service_tier` to
 * request Fast / Priority. Always sent on Codex-backend auth: `model=<id>`
 * or `model=<id>;tier=priority`.
 */
export function codexRoutingHint(model, serviceTier) {
    if (typeof model !== 'string' || model.length === 0)
        return undefined;
    if (typeof serviceTier === 'string' && serviceTier.length > 0) {
        return `model=${model};tier=${serviceTier}`;
    }
    return `model=${model}`;
}
export function codexUpstreamHeaders(session) {
    return {
        authorization: `Bearer ${session.accessToken}`,
        'chatgpt-account-id': session.accountId,
        ...codexCredentialHeaders(),
        'openai-version': CODEX_CLIENT_VERSION,
        'openai-beta': 'responses=experimental',
        accept: 'application/json',
    };
}
