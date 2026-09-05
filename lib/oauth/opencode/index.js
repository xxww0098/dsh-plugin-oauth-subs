/**
 * OpenCode Free — anonymous Zen relay (https://opencode.ai/zen/v1).
 *
 * First-line: anomalyco/opencode v1.18.29. No-key CLI loader sets
 * `apiKey: "public"` (Zen treats that bearer as no key). Store still
 * keeps sentinel `anonymous` so auth.json is non-empty — that value is
 * never sent as Authorization (Zen would treat it as a real key).
 */
export { applyOpencodeCache, opencodeCacheHeaders, opencodeCacheSessionId, resetOpencodePins } from './cache.js';
export const OPENCODE_ZEN_ORIGIN = 'https://opencode.ai/zen/v1';
export const OPENCODE_CHAT_URL = `${OPENCODE_ZEN_ORIGIN}/chat/completions`;
export const OPENCODE_RESPONSES_URL = `${OPENCODE_ZEN_ORIGIN}/responses`;
export const OPENCODE_MODELS_URL = `${OPENCODE_ZEN_ORIGIN}/models`;
export const OPENCODE_MODELS_DEV_URL = 'https://models.dev/api.json';
export const OPENCODE_DOCS_URL = 'https://opencode.ai/docs/zen';
/** anomalyco/opencode release this hop is pinned to. */
export const OPENCODE_CLIENT_VERSION = '1.18.29';
export const OPENCODE_USER_AGENT = `opencode/${OPENCODE_CLIENT_VERSION}`;
/** Official Flag.OPENCODE_CLIENT default. Desktop sends `desktop`. */
export const OPENCODE_CLIENT = 'cli';
/** Official no-key sentinel. Zen `handler.ts`: `raw === "public"` → undefined. */
export const OPENCODE_PUBLIC_TOKEN = 'public';
/** Store sentinel — never sent as Authorization. */
export const OPENCODE_ANON_TOKEN = 'anonymous';
export const OPENCODE_ACCOUNT = 'Anonymous';
export const OPENCODE_NEVER_EXPIRES = 8.64e15;
export const OPENCODE_DEFAULT_CONTEXT = 128_000;
export const OPENCODE_DEFAULT_MAX_TOKENS = 16_384;
export const OPENCODE_INPUT = Object.freeze(['text']);
export const OPENCODE_VISION_INPUT = Object.freeze(['text', 'image']);
export const OPENCODE_REASONING_MUSE = Object.freeze({
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
});
/** models.dev `type: toggle`. Completions hop: off → `reasoning_effort: none`. */
export const OPENCODE_REASONING_TOGGLE = Object.freeze({ off: 'none', high: 'high' });
export const OPENCODE_SOURCES = Object.freeze(['anonymous']);
/** Go-subscription slugs that look free. Never put these on the keyless picker. */
export const OPENCODE_KEYED_FREE = Object.freeze(new Set(['ox-alpha-free']));
/**
 * Official Zen Free pricing ids (https://opencode.ai/docs/zen).
 * Suffix `-free` is not the rule — `big-pickle` is free; stale `*-free` rows are not.
 */
export const OPENCODE_OFFICIAL_FREE = Object.freeze(new Set([
    'big-pickle',
    'ling-3.0-flash-fin-free',
    'mimo-v2.5-free',
    'muse-spark-1.2-contributor-free',
    'muse-spark-1.3-contributor-free',
    'nemotron-3-ultra-free',
    'nemotron-3.5-lightning-free',
]));
export const OPENCODE_DEFAULT_MODEL = 'ling-3.0-flash-fin-free';
export const OPENCODE_PLAN_NAMES = Object.freeze({
    free: 'Free',
});
function model(id, name, extra = {}) {
    return {
        id,
        name,
        contextWindow: extra.contextWindow ?? OPENCODE_DEFAULT_CONTEXT,
        maxTokens: extra.maxTokens ?? OPENCODE_DEFAULT_MAX_TOKENS,
        input: extra.input ? [...extra.input] : [...OPENCODE_INPUT],
        ...(extra.reasoningEfforts ? { reasoningEfforts: { ...extra.reasoningEfforts } } : {}),
    };
}
/**
 * Offline floor: official Zen Free ids + models.dev caps (2026-09-03).
 * Stale Zen slugs (deepseek-v4-flash-free, laguna-s-2.1-free) stay out.
 * Empty reasoning_options + reasoning true omit reasoningEfforts.
 */
export const OPENCODE_MODELS = Object.freeze([
    model('big-pickle', 'Big Pickle', {
        contextWindow: 200_000,
        maxTokens: 32_000,
    }),
    model('ling-3.0-flash-fin-free', 'Ling 3.0 Flash Fin', {
        contextWindow: 262_144,
        maxTokens: 32_768,
        reasoningEfforts: OPENCODE_REASONING_TOGGLE,
    }),
    model('mimo-v2.5-free', 'MiMo V2.5', {
        contextWindow: 200_000,
        maxTokens: 32_000,
        input: OPENCODE_VISION_INPUT,
    }),
    model('muse-spark-1.2-contributor-free', 'Muse Spark 1.2', {
        contextWindow: 1_048_576,
        maxTokens: 131_072,
        input: OPENCODE_VISION_INPUT,
        reasoningEfforts: OPENCODE_REASONING_MUSE,
    }),
    model('muse-spark-1.3-contributor-free', 'Muse Spark 1.3', {
        contextWindow: 1_048_576,
        maxTokens: 131_072,
        input: OPENCODE_VISION_INPUT,
        reasoningEfforts: OPENCODE_REASONING_MUSE,
    }),
    model('nemotron-3-ultra-free', 'Nemotron 3 Ultra', {
        contextWindow: 1_000_000,
        maxTokens: 128_000,
    }),
    model('nemotron-3.5-lightning-free', 'Nemotron 3.5 Lightning', {
        contextWindow: 262_144,
        maxTokens: 262_144,
    }),
]);
export function isOpencodeFreeSlug(id) {
    const bare = String(id ?? '').trim();
    const slug = bare.includes('/') ? bare.slice(bare.lastIndexOf('/') + 1) : bare;
    const lower = slug.toLowerCase();
    if (!lower)
        return false;
    if (OPENCODE_KEYED_FREE.has(lower))
        return false;
    return OPENCODE_OFFICIAL_FREE.has(lower);
}
/** Zen lists Muse Spark on `/zen/v1/responses`. Completions 500s. Future `muse-spark*` keep this hop. */
export function isOpencodeResponsesModel(id) {
    const bare = String(id ?? '').trim();
    const slug = bare.includes('/') ? bare.slice(bare.lastIndexOf('/') + 1) : bare;
    return /^muse-spark/i.test(slug);
}
export function opencodePrettyName(id) {
    const slug = String(id ?? '').trim();
    const bare = slug.replace(/-free$/i, '').replace(/[:_]+/g, ' ').replace(/-/g, ' ').trim();
    return bare.replace(/\b\w/g, (char) => char.toUpperCase()) || 'OpenCode';
}
export function opencodeSourceLabel(source) {
    if (source === 'anonymous')
        return undefined;
    return undefined;
}
export function opencodeSession() {
    return {
        accessToken: OPENCODE_ANON_TOKEN,
        refreshToken: OPENCODE_ANON_TOKEN,
        expiresAt: OPENCODE_NEVER_EXPIRES,
        account: OPENCODE_ACCOUNT,
        source: 'anonymous',
        planType: 'free',
    };
}
export async function refreshOpencode(session) {
    if (!session)
        throw new Error('opencode session missing');
    return {
        ...session,
        accessToken: OPENCODE_ANON_TOKEN,
        refreshToken: OPENCODE_ANON_TOKEN,
        expiresAt: OPENCODE_NEVER_EXPIRES,
        account: session.account?.trim() || OPENCODE_ACCOUNT,
        source: 'anonymous',
        planType: session.planType || 'free',
    };
}
export function isOpencodePermanentRefreshError() {
    return false;
}
/**
 * Official no-key hop identity. `Bearer public` is the CLI sentinel
 * (`provider.ts` `apiKey: "public"`). Never send the store sentinel
 * `anonymous` — GET /models treats any other bearer as a real key.
 */
export function opencodeUpstreamHeaders() {
    return {
        authorization: `Bearer ${OPENCODE_PUBLIC_TOKEN}`,
        'user-agent': OPENCODE_USER_AGENT,
        'x-opencode-client': OPENCODE_CLIENT,
    };
}
