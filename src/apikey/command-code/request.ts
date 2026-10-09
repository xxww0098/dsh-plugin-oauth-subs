/**
 * DSH OpenAI-Completions body ↔ Command Code `POST /alpha/generate` wire.
 *
 * Wire shape (decoded from the command-code CLI bundle; re-verified identical at 1.79.1):
 *   request : { config, memory:null, taste:null, skills:null, mode:'chat',
 *               permissionMode, threadId?, params:{ model, messages, tools,
 *               system, max_tokens, stream:true, temperature?,
 *               reasoning_effort? } }
 *   messages: user    { role:'user',      content: string | part[] }
 *             assist. { role:'assistant', content: [{type:'text'|'reasoning'|
 *                          'tool-call', text, signature?, toolCallId, toolName,
 *                          input}] }
 *             tool    { role:'tool',      content: [{type:'tool-result',
 *                          toolCallId, toolName, output:{type:'text'|
 *                          'error-text', value}}] }
 *   tools   : [{ name, description, input_schema }]   (Anthropic spelling)
 *   response: JSONL events — reasoning-delta/text-delta {text}, tool-call
 *             {toolCallId, toolName, input}, finish {totalUsage, finishReason,
 *             rawFinishReason}, error {message,statusCode,isRetryable}, abort.
 *
 * `config` mirrors buildServerConfig with honest empty context: DSH has no
 * working directory or git state to report, so the fields stay blank rather
 * than fabricating a workspace.
 */

import { commandCodeModelById } from './index.js'

export const COMMAND_CODE_MAX_TOKENS = 64_000

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

/** OpenAI message content → { text, images[] } where images are data-URLs. */
function partsOf(content) {
  if (typeof content === 'string') return { text: content, images: [] }
  if (!Array.isArray(content)) return { text: '', images: [] }
  let text = ''
  const images: any[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    if (part.type === 'text' || part.type === 'input_text') {
      text += textOf(part.text)
    } else if (part.type === 'image_url' || part.type === 'input_image') {
      const url = textOf(part.image_url?.url ?? part.image_url ?? part.url)
      if (/^data:image\//i.test(url)) images.push(url)
      else if (url && !/^https?:/i.test(url)) images.push(`data:image/png;base64,${url}`)
      // Remote http(s) image URLs are not downloaded, same as the reference.
    }
  }
  return { text, images }
}

function userContent({ text, images }: any) {
  const parts: any[] = []
  if (text) parts.push({ type: 'text', text })
  for (const image of images) parts.push({ type: 'image', image })
  if (parts.length === 0) return ''
  // The CLI sends a bare string for the common text-only turn.
  if (parts.length === 1 && parts[0].type === 'text') return text
  return parts
}

function toolCallsOf(message) {
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
  return calls.map((call) => ({
    toolCallId: textOf(call?.id),
    toolName: textOf(call?.function?.name ?? call?.name),
    input: typeof call?.function?.arguments === 'string'
      ? safeJson(call.function.arguments)
      : (call?.function?.arguments ?? {}),
  }))
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

/**
 * Wire `reasoning_effort`: the registry's effort spellings pass through; 'off'
 * (and anything unsupported) omits the field, matching the CLI's
 * `supportsThinking ? effort : undefined` guard.
 */
function wireEffort(model, reasoningEffort) {
  const row = commandCodeModelById(model)
  const effort = textOf(reasoningEffort).trim().toLowerCase()
  if (!effort || effort === 'off') return undefined
  const mapped = row?.reasoningEfforts?.[effort]
  return typeof mapped === 'string' ? mapped : undefined
}

/**
 * Build the `/alpha/generate` body. `threadId` is the cache-affinity field the
 * server uses to pin a conversation's KV; it must be a uuid or absent.
 */
export function openaiToCommandCode(payload, { threadId }: any = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const messages = Array.isArray(source.messages) ? source.messages : []
  const model = textOf(source.model)
  const vision = commandCodeModelById(model)?.input?.includes('image') === true

  const system: string[] = []
  const wire: any[] = []
  // tool_call_id → toolName, so role:'tool' results resolve their name.
  const toolNames = new Map()
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue
    const role = textOf(message.role)
    if (role === 'system' || role === 'developer') {
      const { text } = partsOf(message.content)
      if (text.trim()) system.push(text)
      continue
    }
    if (role === 'assistant') {
      const { text } = partsOf(message.content)
      const content: any[] = []
      const reasoning = textOf(message.reasoning_content ?? message.thinking)
      if (reasoning) {
        content.push({
          type: 'reasoning',
          text: reasoning,
          ...(textOf(message.reasoning_signature ?? message.signature)
            ? { signature: textOf(message.reasoning_signature ?? message.signature) }
            : {}),
        })
      }
      if (text) content.push({ type: 'text', text })
      for (const call of toolCallsOf(message)) {
        if (call.toolCallId) toolNames.set(call.toolCallId, call.toolName)
        content.push(call)
      }
      if (content.length > 0) wire.push({ role: 'assistant', content })
      continue
    }
    if (role === 'tool' || role === 'function') {
      const toolCallId = textOf(message.tool_call_id)
      const { text } = partsOf(message.content)
      wire.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId,
          toolName: toolNames.get(toolCallId) ?? 'unknown',
          output: { type: 'text', value: text },
        }],
      })
      continue
    }
    // user (and anything else) rides the user channel, like the reference.
    const parts = partsOf(message.content)
    if (!vision) parts.images = []
    const content = userContent(parts)
    if (content !== '' && !(Array.isArray(content) && content.length === 0)) {
      wire.push({ role: 'user', content })
    }
  }

  const tools = (Array.isArray(source.tools) ? source.tools : [])
    .map((tool) => ({
      name: textOf(tool?.function?.name ?? tool?.name),
      description: textOf(tool?.function?.description ?? tool?.description),
      input_schema: tool?.function?.parameters ?? tool?.parameters ?? {},
    }))
    .filter((tool) => tool.name.length > 0)

  const params: any = {
    model,
    messages: wire,
    stream: true,
  }
  if (tools.length > 0) params.tools = tools
  if (system.length > 0) params.system = system.join('\n\n')
  const requested = Number(source.max_completion_tokens ?? source.max_tokens)
  params.max_tokens = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, COMMAND_CODE_MAX_TOKENS)
    : COMMAND_CODE_MAX_TOKENS
  if (typeof source.temperature === 'number' && Number.isFinite(source.temperature)) {
    params.temperature = source.temperature
  }
  const effort = wireEffort(model, source.reasoning_effort)
  if (effort) params.reasoning_effort = effort

  const body: any = {
    // buildServerConfig shape with an honest empty workspace — the hop owns
    // no cwd/git state, so nothing is fabricated.
    config: {
      workingDir: '',
      date: new Date().toISOString().split('T')[0],
      environment: process.platform,
      structure: [],
      isGitRepo: false,
      currentBranch: '',
      mainBranch: '',
      gitStatus: '',
      recentCommits: [],
    },
    memory: null,
    taste: null,
    skills: null,
    mode: 'chat',
    permissionMode: 'standard',
    params,
  }
  const thread = textOf(threadId)
  if (thread) body.threadId = thread
  return body
}

/* ---- collected response → chat.completion -------------------------------- */

export function mapCommandCodeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined
  const prompt = Number(usage.inputTokens ?? 0)
  const completion = Number(usage.outputTokens ?? 0)
  const details = usage.inputTokenDetails ?? {}
  const cached = Number(details.cacheReadTokens ?? usage.cacheReadTokens ?? 0)
  const cacheWrite = Number(details.cacheWriteTokens ?? usage.cacheWriteTokens ?? 0)
  const out: any = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  }
  // inputTokens is the AI SDK's whole input (details are subsets), so
  // prompt_tokens already carries the cached share; the host splits it back
  // out. cache write goes into prompt_tokens_details — the top-level
  // prompt_cache_write_tokens alias is read by nothing in the host.
  if (cached > 0 || cacheWrite > 0) {
    out.prompt_tokens_details = {
      ...(cached > 0 ? { cached_tokens: cached } : {}),
      ...(cacheWrite > 0 ? { cache_write_tokens: cacheWrite } : {}),
    }
  }
  return out
}

export function commandCodeFinishReason(reason, hasToolCalls) {
  if (hasToolCalls) return 'tool_calls'
  const raw = textOf(reason).toLowerCase()
  if (raw === 'tool-calls' || raw === 'tool_calls' || raw === 'tool_use') return 'tool_calls'
  if (raw === 'length' || raw === 'max_tokens') return 'length'
  return 'stop'
}

/**
 * `collected` is what runCommandCodeChat accumulated:
 *   { text, reasoning, toolCalls:[{id,name,argumentsJson}], usage, finishReason }
 */
export function commandCodeToOpenai(collected, { model, id }: any = {}) {
  const toolCalls = Array.isArray(collected?.toolCalls) ? collected.toolCalls : []
  const message: any = {
    role: 'assistant',
    content: collected?.text ?? '',
    tool_calls: toolCalls.map((call, index) => ({
      id: call.id || `call_${index}`,
      type: 'function',
      function: { name: call.name ?? '', arguments: call.argumentsJson ?? '' },
    })),
  }
  if (toolCalls.length === 0) delete message.tool_calls
  if (collected?.reasoning) message.reasoning_content = collected.reasoning
  const body: any = {
    id: id ?? `chatcmpl-cc-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: commandCodeFinishReason(collected?.finishReason, toolCalls.length > 0),
    }],
  }
  const usage = mapCommandCodeUsage(collected?.usage)
  if (usage) body.usage = usage
  return body
}

/* ---- OpenAI SSE mapper ---------------------------------------------------- */

/**
 * Translate Command Code JSONL events into OpenAI chat.completion.chunk SSE.
 * `tool-call` events carry the complete `input` object (the upstream emits the
 * call whole, not argument deltas), so each becomes one tool_calls chunk.
 */
export function createCommandCodeOpenaiStream({ model, id }: any = {}) {
  const completionId = id ?? `chatcmpl-cc-${Date.now().toString(36)}`
  const created = Math.floor(Date.now() / 1000)
  let nextToolIndex = 0
  let latestUsage
  let finishReason
  let sentRole = false

  function chunk(delta, finish?, usage?) {
    const choice: any = { index: 0, delta }
    if (finish !== undefined) choice.finish_reason = finish
    const body: any = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [choice],
    }
    if (usage) body.usage = usage
    return `data: ${JSON.stringify(body)}\n\n`
  }

  return {
    id: completionId,
    push(event) {
      if (!event || typeof event !== 'object') return []
      const chunks: any[] = []
      const role = () => {
        if (sentRole) return
        sentRole = true
        chunks.push(chunk({ role: 'assistant' }))
      }
      if (event.type === 'reasoning' && event.delta) {
        role()
        chunks.push(chunk({ reasoning_content: event.delta }))
      } else if (event.type === 'text' && event.delta) {
        role()
        chunks.push(chunk({ content: event.delta }))
      } else if (event.type === 'tool' && event.call) {
        role()
        const call = event.call
        chunks.push(chunk({
          tool_calls: [{
            index: nextToolIndex++,
            ...(call.id ? { id: call.id } : {}),
            type: 'function',
            function: { name: call.name ?? '', arguments: call.argumentsJson ?? '' },
          }],
        }))
      } else if (event.type === 'usage' && event.usage) {
        latestUsage = event.usage
      } else if (event.type === 'finish') {
        finishReason = event.reason
      }
      return chunks
    },
    finish() {
      const chunks: any[] = []
      if (!sentRole) chunks.push(chunk({ role: 'assistant' }))
      chunks.push(chunk(
        {},
        commandCodeFinishReason(finishReason, nextToolIndex > 0),
        latestUsage ? mapCommandCodeUsage(latestUsage) : undefined,
      ))
      chunks.push('data: [DONE]\n\n')
      return chunks
    },
  }
}
