/**
 * Shape DSH openai-responses bodies for xAI Grok.
 *
 * grok-build (xai-org/grok-build) sends `instructions: null` and keeps
 * system in `input`. Prefix cache stays hot only when later turns replay
 * that order byte for byte. DSH prepends a fresh developer/system snapshot
 * every step; those extras park at the input suffix, same idea as Codex
 * but without lifting into top-level `instructions`.
 *
 * Cache identity lives in `./cache.ts`.
 */
import { grokConversationId, pinGrokSystemPrefix } from './cache.js';
const INSTRUCTION_ROLES = new Set(['system', 'developer']);
function instructionText(item) {
    if (typeof item?.content === 'string')
        return item.content.trim();
    if (!Array.isArray(item?.content))
        return '';
    return item.content
        .map((part) => {
        if (typeof part === 'string')
            return part;
        if (part && typeof part.text === 'string')
            return part.text;
        return '';
    })
        .join('')
        .trim();
}
function systemItem(text) {
    return { role: 'system', content: text };
}
function developerItem(text) {
    return { role: 'developer', content: [{ type: 'input_text', text }] };
}
function splitLeadingInstructions(input) {
    const lifted = [];
    const rest = [];
    for (const item of input) {
        if (rest.length === 0 && item && INSTRUCTION_ROLES.has(item.role)) {
            const text = instructionText(item);
            if (text)
                lifted.push(text);
            continue;
        }
        rest.push(item);
    }
    return { lifted: lifted.join('\n\n'), rest };
}
function stabilizeGrokInput(next, conversationId) {
    if (!Array.isArray(next.input))
        return next;
    const { lifted, rest } = splitLeadingInstructions(next.input);
    const { pinned, extra } = pinGrokSystemPrefix(conversationId, lifted);
    const prefix = [];
    if (pinned)
        prefix.push(systemItem(pinned));
    const suffix = extra ? [developerItem(extra)] : [];
    next.input = [...prefix, ...rest, ...suffix];
    return next;
}
export function normalizeGrokResponsesBody(payload) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        return payload;
    return stabilizeGrokInput({ ...payload }, grokConversationId(payload));
}
