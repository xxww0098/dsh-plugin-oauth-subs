/**
 * Cline Completions hop.
 *
 * Three edits copied from the pinned CLI, no more:
 *  1. `withMaxCompletionTokensForReasoningModels` — for an OpenAI
 *     reasoning-era id (`isOpenAIReasoningEraModelId`) `max_tokens` is renamed
 *     to `max_completion_tokens`; OpenRouter refuses the old name there.
 *  2. `includeUsage: true` — `@ai-sdk/openai-compatible` turns it into
 *     `stream_options.include_usage`, so the SSE tail carries usage.
 *  3. `reasoning_effort` stays on the wire only when the catalog advertises
 *     the model, with `max` → `xhigh` (`portable-reasoning.ts`).
 */
import { clineCatalogModels } from './catalog.js';
import { CLINE_MODELS } from './index.js';
import { UpstreamFailure, quotaFailure } from '../upstream.js';
const OFF = new Set(['off', 'none', 'disabled', false, null, '']);
/** `OPENAI_O_SERIES_MODEL_ID_PATTERN` / `OPENAI_GPT5_FAMILY_MODEL_ID_PATTERN`. */
const O_SERIES = /(^|[^a-z0-9])o[134](?=$|[^a-z0-9])/;
const GPT5_FAMILY = /(^|[^a-z0-9])gpt-?5(?=$|[^a-z0-9])/;
export function isClineReasoningEraModel(modelId) {
    const normalized = typeof modelId === 'string' ? modelId.trim().toLowerCase() : '';
    if (!normalized)
        return false;
    return O_SERIES.test(normalized) || GPT5_FAMILY.test(normalized);
}
function modelOf(id) {
    const name = typeof id === 'string' ? id : '';
    return clineCatalogModels().find((model) => model.id === name)
        ?? CLINE_MODELS.find((model) => model.id === name);
}
function advertisedEfforts(model) {
    const raw = model?.reasoningEfforts;
    if (!raw || typeof raw !== 'object')
        return undefined;
    return raw;
}
function wireEffort(value, efforts) {
    if (value === undefined)
        return undefined;
    if (OFF.has(value))
        return undefined;
    if (efforts[value] !== undefined)
        return efforts[value];
    const hit = Object.values(efforts).find((wire) => wire === value);
    return typeof hit === 'string' ? hit : undefined;
}
export function applyClineThinking(payload = {}, model) {
    const next = { ...payload };
    const effort = next.reasoning_effort;
    const row = model ?? modelOf(next.model);
    const efforts = advertisedEfforts(row);
    const wire = efforts ? wireEffort(effort, efforts) : undefined;
    if (wire)
        next.reasoning_effort = wire;
    else
        delete next.reasoning_effort;
    return next;
}
export function applyClineMaxCompletionTokens(payload = {}) {
    if (!payload || typeof payload !== 'object')
        return payload;
    const { max_tokens: maxTokens, ...rest } = payload;
    if (maxTokens == null || !isClineReasoningEraModel(payload.model))
        return payload;
    return {
        ...rest,
        max_completion_tokens: rest.max_completion_tokens ?? maxTokens,
    };
}
/** Completions SSE omits usage unless the vendor is asked. Do not override an explicit value. */
export function applyClineStreamUsage(payload = {}) {
    if (!payload || payload.stream !== true)
        return payload;
    const current = payload.stream_options;
    if (current && typeof current === 'object' && Object.hasOwn(current, 'include_usage'))
        return payload;
    return {
        ...payload,
        stream_options: current && typeof current === 'object'
            ? { ...current, include_usage: true }
            : { include_usage: true },
    };
}
/**
 * Cline answers a **non-streaming** chat with the same `{success, data}` envelope
 * as its account endpoints — live-verified 2026-09-19:
 * `{"data":{"choices":[…]}, "success":true}`. SSE answers are not wrapped.
 * The CLI only unwraps this for OpenRouter image requests
 * (`createSuccessDataResponseFetch`), because its text path always streams;
 * a DSH non-streaming call would otherwise read `choices` off the envelope.
 */
export function unwrapClineEnvelope(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return payload;
    if (payload.success !== true)
        return payload;
    const data = payload.data;
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return payload;
    return data;
}
/**
 * Official matchers from `@cline/llms` `providers.js` (0.0.92),
 * `isClineFreeModelLimitMessage` / `isClinePassLimitMessage` /
 * `isClineNotSubscribedMessage` / `isClineOrgIndividualInferenceSubscriptionMessage`.
 * A 403 forwarded as-is is AUTH to the host (`classifyPiAiError` matches
 * `\b403\b` before the body), so an entitlement must not keep that status
 * or echo a body that contains 401/403.
 */
const NOT_SUBSCRIBED = 'the user is not subscribed to required model plan';
const NO_CLINE_PASS = 'no access to clinepass subscription models yet. subscribe to clinepass';
const ORG_INDIVIDUAL = 'organization accounts cannot use individual model inference subscriptions';
const REACHED = 'you have reached your';
const PASS_LIMIT = 'clinepass limit';
const TRY_LATER = 'please try again later.';
const FREE_LIMIT = 'free limit reached on model';
const SUBSCRIBE_URL = 'https://app.cline.bot/dashboard/subscription?personal=true';
function clineErrorBits(payload) {
    const texts = [];
    const codes = [];
    const visit = (value, depth) => {
        if (!value || depth > 3 || typeof value !== 'object')
            return;
        if (typeof value.message === 'string')
            texts.push(value.message);
        if (typeof value.error === 'string')
            texts.push(value.error);
        if (typeof value.code === 'string')
            codes.push(value.code);
        if (typeof value.type === 'string')
            codes.push(value.type);
        if (value.error && typeof value.error === 'object')
            visit(value.error, depth + 1);
        if (value.data && typeof value.data === 'object')
            visit(value.data, depth + 1);
    };
    if (typeof payload === 'string')
        texts.push(payload);
    else
        visit(payload, 0);
    return {
        text: texts.map((part) => part.trim()).filter(Boolean).join(' '),
        code: codes.map((part) => part.trim().toLowerCase()).find(Boolean) ?? '',
    };
}
function isClinePassLimitMessage(text) {
    const lower = text.toLowerCase();
    const start = lower.indexOf(REACHED);
    if (start === -1)
        return false;
    const end = lower.indexOf(TRY_LATER, start);
    if (end === -1)
        return false;
    return lower.slice(start, end + TRY_LATER.length).includes(PASS_LIMIT);
}
/**
 * Caps become `usage limit reached:` so the host stops retrying. Entitlement
 * (not subscribed / org cannot use individual inference) is a 400: a 403
 * would look like a dead login. Other 429s stay the upstream's own answer.
 */
export function clineQuotaFailure(status, payload) {
    // 401 stays a 401 so the shared refresh-once path can run. Rewriting it
    // would hide a dead access token behind an entitlement 400.
    if (status === 401)
        return undefined;
    const { text, code } = clineErrorBits(payload);
    const lower = text.toLowerCase();
    const freeCap = code === 'inference_cap_error' || lower.includes(FREE_LIMIT);
    const credits = status === 402
        || code === 'insufficient_credits'
        || lower.includes('insufficient_credits')
        || lower.includes('insufficient credits');
    const spend = code === 'spend_limit_exceeded' || lower.includes('spend limit');
    if (freeCap || isClinePassLimitMessage(text) || credits || spend) {
        return quotaFailure(text || `Cline ${status} ${code || 'quota'}`);
    }
    const notSubscribed = code === 'entitlement_error' || lower.includes(NOT_SUBSCRIBED) || lower.includes(NO_CLINE_PASS);
    const org = lower.includes(ORG_INDIVIDUAL);
    if (!notSubscribed && !org)
        return undefined;
    const detail = org
        ? 'Organization accounts cannot use individual ClinePass inference. Switch to a personal account.'
        : `No access to ClinePass subscription models yet. Subscribe at ${SUBSCRIBE_URL}`;
    return new UpstreamFailure(400, detail, { code: 'http' });
}
/** Map vendor cache-read aliases. Absent field stays absent — do not invent 0. */
export function mapClineUsage(usage) {
    if (!usage || typeof usage !== 'object')
        return usage;
    // Pick the first alias that is actually a valid count: ?? would stop at a
    // present-but-invalid value (e.g. the string "123") and skip a valid later one.
    const cached = [
        usage.prompt_tokens_details?.cached_tokens,
        usage.cached_tokens,
        usage.cache_read_input_tokens,
        usage.cache_read_tokens,
    ].find((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    if (cached === undefined)
        return usage;
    const details = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
        ? { ...usage.prompt_tokens_details }
        : {};
    if (typeof details.cached_tokens !== 'number')
        details.cached_tokens = cached;
    return { ...usage, prompt_tokens_details: details };
}
