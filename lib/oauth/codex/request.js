/**
 * Shape a generic openai-responses body for chatgpt.com Codex.
 *
 * DSH/llm-pi-ai speaks openai-responses (system prompt lives in `input` as
 * developer/system). The Codex subscription backend requires a top-level
 * `instructions` string and rejects several public-API-only fields.
 *
 * Cache: Codex matches the longest stable prefix of `instructions` then
 * `input`. Extra leading developer/system items (plan dumps, header rebuilds)
 * must not sit at the front of `input` or the whole history misses. Those
 * extras are parked at the suffix so the conversation prefix can still hit.
 */
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
function developerItem(text) {
    return { role: 'developer', content: [{ type: 'input_text', text }] };
}
export function liftInstructions(input) {
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
    return { instructions: lifted.join('\n\n'), input: rest };
}
function stabilizeInputPrefix(next) {
    if (!Array.isArray(next.input)) {
        if (typeof next.instructions !== 'string' || next.instructions.trim() === '') {
            next.instructions = 'You are a helpful assistant.';
        }
        else {
            next.instructions = next.instructions.trim();
        }
        return next;
    }
    const { instructions: lifted, input: rest } = liftInstructions(next.input);
    const existing = typeof next.instructions === 'string' ? next.instructions.trim() : '';
    if (!existing) {
        next.instructions = lifted || 'You are a helpful assistant.';
        next.input = rest;
        return next;
    }
    next.instructions = existing;
    if (!lifted || lifted === existing) {
        next.input = rest;
        return next;
    }
    let extra = lifted;
    if (lifted.startsWith(existing)) {
        extra = lifted.slice(existing.length).replace(/^\n+/, '').trim();
    }
    else if (existing.startsWith(lifted)) {
        extra = '';
    }
    next.input = extra ? [...rest, developerItem(extra)] : rest;
    return next;
}
export function normalizeCodexResponsesBody(payload) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        return payload;
    const next = stabilizeInputPrefix({ ...payload });
    if (next.reasoning && typeof next.reasoning === 'object' && !Array.isArray(next.reasoning)) {
        const reasoning = { ...next.reasoning };
        if (reasoning.mode === 'standard' || reasoning.mode === 'pro')
            delete reasoning.mode;
        next.reasoning = reasoning;
    }
    if (next.service_tier === 'fast')
        next.service_tier = 'priority';
    if (next.service_tier === 'default' || next.service_tier === 'auto')
        delete next.service_tier;
    // ChatGPT Codex Responses 400 unless store is false (Codex CLI sets this
    // false on every non-Azure request).
    next.store = false;
    // gpt-5.6 rejects prompt_cache_retention / prompt_cache_options (Codex #39397).
    delete next.prompt_cache_options;
    delete next.prompt_cache_retention;
    delete next.safety_identifier;
    delete next.max_output_tokens;
    if (!Array.isArray(next.include) || next.include.length === 0) {
        next.include = ['reasoning.encrypted_content'];
    }
    return next;
}
