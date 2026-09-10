/**
 * OpenCode Go model catalog.
 *
 * 28 models across three wire protocols. Sources:
 *   - endpoint / api / id / display name: official Go docs "API 端点" table
 *   - contextWindow / maxTokens / input: models.dev provider "opencode-go"
 *     (the upstream catalog at models.opencode.ai)
 *   - reasoningEfforts: installed pi-ai catalog for ids it ships, else the
 *     openclaw opencode-go provider manifest (supportedReasoningEfforts) and
 *     OmniRoute's opencode effort tiers
 *
 * Completions models that the installed pi-ai catalog already describes omit
 * reasoningEfforts on purpose: the route keeps that model's own
 * reasoning / thinkingLevelMap (DSH copies the catalog base when the entry
 * declares no efforts), so the picker ladder stays exactly what pi-ai ships.
 * Only ids pi-ai does not describe carry an explicit ladder here.
 */

export const OPENCODE_GO_OPENAI_BASE_URL = 'https://opencode.ai/zen/go/v1'
export const OPENCODE_GO_ANTHROPIC_BASE_URL = 'https://opencode.ai/zen/go'

const TEXT = ['text']
const TEXT_IMAGE = ['text', 'image']

/** pi-ai deepseek-v4-flash effort ladder (DeepSeek V4.1 Flash shares it). */
const DEEPSEEK_FLASH_REASONING = { low: 'low', high: 'high', max: 'max' }
const GROK_REASONING = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }
const GPT_LUNA_REASONING = { off: 'none', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }
const MUSE_REASONING = { minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' }
const QWEN_ANTHROPIC_REASONING = { low: 'low', medium: 'medium', high: 'high', max: 'max' }

function model(id, name, contextWindow, maxTokens, input, reasoningEfforts, extra) {
  const row = { id, name, contextWindow, maxTokens, input: [...input] }
  if (reasoningEfforts !== undefined) row.reasoningEfforts = { ...reasoningEfforts }
  if (extra) Object.assign(row, extra)
  return row
}

/** @ai-sdk/openai-compatible - POST {baseURL}/chat/completions */
export const OPENCODE_GO_COMPLETIONS = [
  model('glm-5.3-flash', 'GLM-5.3-Flash', 1_000_000, 131_072, TEXT_IMAGE),
  model('glm-5.3', 'GLM-5.3', 1_000_000, 131_072, TEXT),
  model('glm-5.2', 'GLM-5.2', 1_000_000, 131_072, TEXT),
  model('glm-5.1', 'GLM-5.1', 202_752, 32_768, TEXT),
  model('kimi-k3', 'Kimi K3', 1_048_576, 131_072, TEXT_IMAGE),
  model('kimi-k2.7-code', 'Kimi K2.7 Code', 262_144, 262_144, TEXT_IMAGE),
  model('kimi-k2.6', 'Kimi K2.6', 262_144, 65_536, TEXT_IMAGE),
  model('longcat-2.0', 'LongCat-2.0', 1_000_000, 131_072, TEXT),
  model('deepseek-flash', 'DeepSeek V4.1 Flash', 1_000_000, 384_000, TEXT_IMAGE, DEEPSEEK_FLASH_REASONING, {
    // Same OpenAI-compat dialect as pi-ai deepseek-v4-flash: max_tokens, no
    // developer role, reasoning_content carried on assistant turns.
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      maxTokensField: 'max_tokens',
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: 'deepseek',
    },
  }),
  model('deepseek-v4-pro', 'DeepSeek V4 Pro', 1_000_000, 384_000, TEXT),
  model('deepseek-v4-flash', 'DeepSeek V4 Flash', 1_000_000, 384_000, TEXT),
  model('deepseek-v4-flash-vision-exp', 'DeepSeek V4 Flash Vision Exp', 1_000_000, 384_000, TEXT_IMAGE),
  model('mimo-v2.5', 'MiMo-V2.5', 1_000_000, 128_000, TEXT_IMAGE),
  model('mimo-v2.5-pro', 'MiMo-V2.5-Pro', 1_048_576, 128_000, TEXT),
  model('hy4-preview', 'Hy4 preview', 1_024_000, 64_000, TEXT),
  model('hy3', 'Hy3', 256_000, 128_000, TEXT),
]

/** @ai-sdk/openai - POST {baseURL}/responses */
export const OPENCODE_GO_RESPONSES = [
  model('grok-4.6', 'Grok 4.6', 500_000, 500_000, TEXT_IMAGE, GROK_REASONING),
  model('gpt-5.6-luna', 'GPT 5.6 Luna', 1_050_000, 128_000, TEXT_IMAGE, GPT_LUNA_REASONING),
  model('muse-spark-1.3-contributor', 'Muse Spark 1.3 Contributor', 1_048_576, 131_072, TEXT_IMAGE, MUSE_REASONING),
  model('muse-spark-1.2-contributor', 'Muse Spark 1.2 Contributor', 1_048_576, 131_072, TEXT_IMAGE, MUSE_REASONING),
]

/** @ai-sdk/anthropic - Anthropic SDK posts {baseURL}/v1/messages */
export const OPENCODE_GO_ANTHROPIC = [
  model('minimax-m3', 'MiniMax M3', 1_000_000, 131_072, TEXT_IMAGE, false),
  model('minimax-m2.7', 'MiniMax M2.7', 204_800, 131_072, TEXT, false),
  model('minimax-m2.5', 'MiniMax M2.5', 204_800, 65_536, TEXT, false),
  model('qwen3.8-max', 'Qwen3.8 Max', 1_000_000, 131_072, TEXT_IMAGE, QWEN_ANTHROPIC_REASONING),
  model('qwen3.8-flash', 'Qwen3.8 Flash', 1_000_000, 131_072, TEXT_IMAGE, false),
  model('qwen3.7-max', 'Qwen3.7 Max', 1_000_000, 65_536, TEXT, QWEN_ANTHROPIC_REASONING),
  model('qwen3.7-plus', 'Qwen3.7 Plus', 1_000_000, 65_536, TEXT_IMAGE, QWEN_ANTHROPIC_REASONING),
  model('qwen3.6-plus', 'Qwen3.6 Plus', 1_000_000, 65_536, TEXT_IMAGE, QWEN_ANTHROPIC_REASONING),
]

/**
 * The three DSH routes OpenCode Go needs: DSH llm-pi-ai is one provider =
 * one api, while Go serves the same subscription over three protocols.
 */
export const OPENCODE_GO_ROUTES = Object.freeze([
  {
    id: 'opencode-go',
    displayName: 'OpenCode Go',
    api: 'openai-completions',
    baseURL: OPENCODE_GO_OPENAI_BASE_URL,
    models: OPENCODE_GO_COMPLETIONS,
  },
  {
    id: 'opencode-go-responses',
    displayName: 'OpenCode Go · Responses',
    api: 'openai-responses',
    baseURL: OPENCODE_GO_OPENAI_BASE_URL,
    models: OPENCODE_GO_RESPONSES,
  },
  {
    id: 'opencode-go-anthropic',
    displayName: 'OpenCode Go · Anthropic',
    api: 'anthropic-messages',
    baseURL: OPENCODE_GO_ANTHROPIC_BASE_URL,
    models: OPENCODE_GO_ANTHROPIC,
  },
])

export const OPENCODE_GO_MODEL_COUNT = OPENCODE_GO_ROUTES.reduce((n, route) => n + route.models.length, 0)
