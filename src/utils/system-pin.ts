/**
 * Pure text helpers shared by the implicit-prefix cache families
 * (cline/copilot/glm/kimi/cursor/kiro/antigravity). These carry NO pin
 * state on purpose: the SYSTEM_PINS map, usePin, and every stabilize*()
 * function are each family's cache and stay in its own cache.ts
 * (docs/rules.md — never share cache state across families, never put
 * cache rewrite in src/utils/).
 */

/** Flatten one message's content to text: string, content-part array, or scalar. */
export function systemText(message: { content?: unknown } | null | undefined): string {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content == null ? '' : String(content)
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part.text === 'string') return part.text
      return ''
    })
    .join('')
}

/** Split the leading run of system messages off the rest of the array. */
export function splitLeadingSystem(messages: readonly any[]): { head: any[]; rest: any[] } {
  const head: any[] = []
  let index = 0
  while (index < messages.length && messages[index]?.role === 'system') {
    head.push(messages[index])
    index += 1
  }
  return { head, rest: messages.slice(index) }
}

/** Under half of the shorter text shared as prefix + suffix: a different
 * prompt, not an edit of the pinned one. DSH's session-title request shares
 * the chat's session id; parking the chat's prompt behind a pinned title
 * prompt made the model answer with a title. */
export function unrelatedPrompt(existing: string, text: string): boolean {
  const max = Math.min(existing.length, text.length)
  let prefix = 0
  while (prefix < max && existing.charCodeAt(prefix) === text.charCodeAt(prefix)) prefix += 1
  let suffix = 0
  while (suffix < max - prefix
    && existing.charCodeAt(existing.length - 1 - suffix) === text.charCodeAt(text.length - 1 - suffix)) suffix += 1
  return (prefix + suffix) * 2 < max
}
