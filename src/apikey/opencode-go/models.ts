/**
 * OpenCode Go catalog (API key family).
 *
 * DSH's installed pi-ai catalog ships 27 official Go models, but llm-pi-ai
 * cannot append to a catalog route: a non-empty `models` list replaces the
 * whole served catalog and a route-level `api` overrides every model's own
 * wire protocol. OpenCode Go speaks three protocols, so this plugin owns the
 * complete list on two routes of its own:
 *
 *   `opencode-go-flash`     openai-completions  — 27 models (display "OpenCode Go")
 *   `opencode-go-responses` openai-responses    —  5 models
 *
 * Sources (all 2026-09-23):
 *   - `GET https://opencode.ai/zen/go/v1/models` (public 40, this key 33)
 *   - Go docs model list + "API 端点" table (protocol per model)
 *   - models.dev provider `opencode-go` (contextWindow / maxTokens / input /
 *     effort ladders) and the installed pi-ai catalog (`compat` dialects)
 *   - live `/chat/completions` probes: every completions row answered 200
 *     except the Responses family below; the seven public ids this listing
 *     omits answered "Model is unavailable" or are not in the docs list
 *     (kimi-k2.5 / glm-5 / qwen3.5-plus / mimo-v2-pro / mimo-v2-omni /
 *     hy3-preview / grok-4.5) — the live `/models` may still name them, but
 *     the gateway does not serve them on either protocol here. The legacy
 *     alias `deepseek-flash` is served too but not listed: it is the same
 *     model as the docs id `deepseek-v4.1-flash`, and two rows rendered as
 *     duplicates in the picker. 28 -> 27 completions rows after that.
 */

export const OPENCODE_GO_BUILTIN_ROUTE_ID = 'opencode-go'
export const OPENCODE_GO_EXTRA_ROUTE_ID = 'opencode-go-flash'
export const OPENCODE_GO_RESPONSES_ROUTE_ID = 'opencode-go-responses'
export const OPENCODE_GO_OPENAI_BASE_URL = 'https://opencode.ai/zen/go/v1'

/**
 * Console Go hard-requires a stable session id (400 `MissingSessionID`
 * otherwise): https://opencode.ai/docs/go/#where-can-i-use-it. DSH passes a
 * per-conversation `sessionId` into pi-ai, but pi-ai 0.85.1 never writes
 * `x-opencode-session` (the vendor lists DeepSeek Harness under "Known
 * Problematic Clients"), and llm-pi-ai withholds `sendSessionAffinityHeaders`,
 * so a profile cannot forward it either. A stable route header is the only
 * direct-route value the seam can carry; one shard per DSH install is the
 * fallback the vendor accepts.
 */
export const OPENCODE_GO_SESSION_HEADER = 'x-opencode-session'
export const OPENCODE_GO_SESSION_ID = 'dsh-opencode-go'

/** The one route header both Go routes carry. */
export function opencodeGoSessionHeaders() {
  return { [OPENCODE_GO_SESSION_HEADER]: OPENCODE_GO_SESSION_ID }
}

const TEXT = ['text']
const TEXT_IMAGE = ['text', 'image']

/** pi-ai catalog effort ladders (DSH picker keys -> wire spellings). */
const EFFORT_LOW_HIGH_MAX = { low: 'low', high: 'high', max: 'max' }
const EFFORT_HIGH_MAX = { high: 'high', max: 'max' }
const EFFORT_LOW_HIGH = { low: 'low', high: 'high' }
const EFFORT_KIMI_K3 = { max: 'max' }
const EFFORT_QWEN38 = { low: 'low', medium: 'medium', xhigh: 'xhigh' }
const EFFORT_HY4 = { off: 'none', high: 'high' }
const EFFORT_HY3 = { off: 'none', low: 'low', high: 'high' }
const EFFORT_GROK = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }
const EFFORT_GPT56 = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
const EFFORT_MUSE = { minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }

/** pi-ai completions dialects: plain OpenAI-compat, and DeepSeek's. */
const OPENAI_COMPAT = {
  supportsStore: false,
  supportsDeveloperRole: false,
  maxTokensField: 'max_tokens',
}
const DEEPSEEK_COMPAT = {
  ...OPENAI_COMPAT,
  requiresReasoningContentOnAssistantMessages: true,
  thinkingFormat: 'deepseek',
}

function model(id, name, contextWindow, maxTokens, input, reasoningEfforts, extra?) {
  const row: any = { id, name, contextWindow, maxTokens, input: [...input] }
  // `false` must stay `false`: `{ ...false }` is `{}`, and DSH rejects an
  // empty reasoningEfforts dict for the whole atomic llm-pi-ai write.
  if (reasoningEfforts === false) row.reasoningEfforts = false
  else if (reasoningEfforts !== undefined) row.reasoningEfforts = { ...reasoningEfforts }
  if (extra) Object.assign(row, extra)
  return row
}

/** Every official Go model that answers on /chat/completions. */
export const OPENCODE_GO_EXTRA_MODELS = Object.freeze([
  model('deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 1_000_000, 384_000, TEXT_IMAGE, EFFORT_LOW_HIGH_MAX, { compat: DEEPSEEK_COMPAT }),
  model('deepseek-v4-flash', 'DeepSeek V4 Flash', 1_000_000, 384_000, TEXT, EFFORT_LOW_HIGH_MAX, { compat: DEEPSEEK_COMPAT }),
  model('deepseek-v4-flash-vision-exp', 'DeepSeek V4 Flash Vision Exp', 1_000_000, 384_000, TEXT_IMAGE, EFFORT_LOW_HIGH_MAX, { compat: DEEPSEEK_COMPAT }),
  model('deepseek-v4-pro', 'DeepSeek V4 Pro', 1_000_000, 384_000, TEXT, EFFORT_HIGH_MAX, { compat: DEEPSEEK_COMPAT }),
  model('glm-5.3', 'GLM-5.3', 1_000_000, 131_072, TEXT, EFFORT_LOW_HIGH_MAX, { compat: OPENAI_COMPAT }),
  model('glm-5.3-flash', 'GLM-5.3-Flash', 1_000_000, 131_072, TEXT_IMAGE, EFFORT_LOW_HIGH_MAX, { compat: OPENAI_COMPAT }),
  model('glm-5.2', 'GLM-5.2', 1_000_000, 131_072, TEXT, EFFORT_HIGH_MAX, { compat: OPENAI_COMPAT }),
  model('glm-5.1', 'GLM-5.1', 202_752, 32_768, TEXT, false, { compat: OPENAI_COMPAT }),
  model('kimi-k3', 'Kimi K3', 1_048_576, 131_072, TEXT_IMAGE, EFFORT_KIMI_K3, { compat: OPENAI_COMPAT }),
  model('kimi-k2.7-code', 'Kimi K2.7 Code', 262_144, 262_144, TEXT_IMAGE, false, { compat: OPENAI_COMPAT }),
  model('kimi-k2.6', 'Kimi K2.6', 262_144, 65_536, TEXT_IMAGE, false, { compat: OPENAI_COMPAT }),
  model('longcat-2.0', 'LongCat-2.0', 1_000_000, 131_072, TEXT, false, { compat: OPENAI_COMPAT }),
  model('mimo-v2.6-flash', 'MiMo-V2.6-Flash', 1_048_576, 131_072, TEXT_IMAGE, false, { compat: OPENAI_COMPAT }),
  model('mimo-v2.6-pro', 'MiMo-V2.6-Pro', 1_048_576, 131_072, TEXT_IMAGE, false, { compat: OPENAI_COMPAT }),
  model('mimo-v2.5', 'MiMo-V2.5', 1_000_000, 128_000, TEXT_IMAGE, false, { compat: OPENAI_COMPAT }),
  model('mimo-v2.5-pro', 'MiMo-V2.5-Pro', 1_048_576, 128_000, TEXT, false, { compat: OPENAI_COMPAT }),
  model('minimax-m3', 'MiniMax M3', 1_000_000, 131_072, TEXT_IMAGE, false, { compat: OPENAI_COMPAT }),
  model('minimax-m2.7', 'MiniMax M2.7', 204_800, 131_072, TEXT, false, { compat: OPENAI_COMPAT }),
  model('minimax-m2.5', 'MiniMax M2.5', 204_800, 65_536, TEXT, false, { compat: OPENAI_COMPAT }),
  model('qwen3.8-max', 'Qwen3.8 Max', 1_000_000, 131_072, TEXT_IMAGE, EFFORT_QWEN38, { compat: OPENAI_COMPAT }),
  model('qwen3.8-flash', 'Qwen3.8 Flash', 1_000_000, 131_072, TEXT_IMAGE, EFFORT_QWEN38, { compat: OPENAI_COMPAT }),
  model('qwen3.7-max', 'Qwen3.7 Max', 1_000_000, 65_536, TEXT, false, { compat: OPENAI_COMPAT }),
  model('qwen3.7-plus', 'Qwen3.7 Plus', 1_000_000, 65_536, TEXT, false, { compat: OPENAI_COMPAT }),
  model('qwen3.6-plus', 'Qwen3.6 Plus', 1_000_000, 65_536, TEXT, false, { compat: OPENAI_COMPAT }),
  model('hy4-preview', 'Hy4 Preview', 1_024_000, 64_000, TEXT, EFFORT_HY4, { compat: OPENAI_COMPAT }),
  model('hy3', 'Hy3', 256_000, 128_000, TEXT, EFFORT_HY3, { compat: OPENAI_COMPAT }),
  model('omen-alpha', 'Omen Alpha', 500_000, 128_000, TEXT_IMAGE, EFFORT_LOW_HIGH, { compat: OPENAI_COMPAT }),
])

/** Official Go models that only answer on /responses. */
export const OPENCODE_GO_RESPONSES_MODELS = Object.freeze([
  model('grok-4.7', 'Grok 4.7', 500_000, 500_000, TEXT_IMAGE, EFFORT_GROK),
  model('grok-4.6', 'Grok 4.6', 500_000, 500_000, TEXT_IMAGE, EFFORT_GROK),
  model('gpt-5.6-luna', 'GPT-5.6 Luna', 1_050_000, 128_000, TEXT_IMAGE, EFFORT_GPT56),
  model('muse-spark-1.3-contributor', 'Muse Spark 1.3 Contributor', 1_048_576, 131_072, TEXT_IMAGE, EFFORT_MUSE),
  model('muse-spark-1.2-contributor', 'Muse Spark 1.2 Contributor', 1_048_576, 131_072, TEXT_IMAGE, EFFORT_MUSE),
])

export const OPENCODE_GO_EXTRA_ROUTE = Object.freeze({
  id: OPENCODE_GO_EXTRA_ROUTE_ID,
  displayName: 'OpenCode Go',
  api: 'openai-completions',
  baseURL: OPENCODE_GO_OPENAI_BASE_URL,
  headers: Object.freeze(opencodeGoSessionHeaders()),
  models: OPENCODE_GO_EXTRA_MODELS,
})

export const OPENCODE_GO_RESPONSES_ROUTE = Object.freeze({
  id: OPENCODE_GO_RESPONSES_ROUTE_ID,
  displayName: 'OpenCode Go · Responses',
  api: 'openai-responses',
  baseURL: OPENCODE_GO_OPENAI_BASE_URL,
  headers: Object.freeze(opencodeGoSessionHeaders()),
  models: OPENCODE_GO_RESPONSES_MODELS,
})

export const OPENCODE_GO_ROUTES = Object.freeze([OPENCODE_GO_EXTRA_ROUTE, OPENCODE_GO_RESPONSES_ROUTE])
