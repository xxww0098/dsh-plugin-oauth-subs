/**
 * OpenCode Free Completions hop. Map DSH `reasoning_effort` onto
 * OpenAI-style top-level `reasoning_effort` the way Zen / Hermes
 * opencode-free accept. Never send both `thinking` and `reasoning_effort`.
 * Never send Authorization (headers live in index.ts).
 */
export declare function applyOpencodeThinking(payload: {}, model: any): {};
