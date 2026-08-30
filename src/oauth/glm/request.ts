/**
 * Shape a generic OpenAI chat/completions body for Zhipu Coding Plan.
 *
 * DSH injects `role: "developer"` (system prompt, AGENTS.md, CLAUDE.md).
 * Coding Plan only accepts system / user / assistant / tool — anything
 * else is 400 `1214 角色信息不正确`.
 */

const GLM_CHAT_ROLES = new Set(['system', 'user', 'assistant', 'tool'])

export function normalizeGlmChatBody(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  if (!Array.isArray(payload.messages)) return payload
  return {
    ...payload,
    messages: payload.messages.map((message) => {
      if (!message || typeof message !== 'object' || Array.isArray(message)) return message
      const role = message.role
      if (typeof role !== 'string' || GLM_CHAT_ROLES.has(role)) return message
      return { ...message, role: 'system' }
    }),
  }
}
