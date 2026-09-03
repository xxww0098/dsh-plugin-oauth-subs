/**
 * Ollama Cloud subscription on ollama.com — not the local 127.0.0.1:11434
 * daemon that already hosts DSH (`ollama launch dsh`).
 *
 * Programmatic auth is an API key from https://ollama.com/settings/keys
 * sent as `Authorization: Bearer`. `ollama signin` is local-daemon SSH
 * signing (`~/.ollama/id_ed25519`); that public key is not a Bearer.
 *
 * Chat hop is OpenAI Completions at https://ollama.com/v1/chat/completions
 * (official Factory docs + 401-not-404 probe). Native `/api/chat` stays
 * unused unless that /v1 route disappears.
 */
export declare const OLLAMA_CLOUD_ORIGIN = "https://ollama.com";
export declare const OLLAMA_CHAT_URL = "https://ollama.com/v1/chat/completions";
export declare const OLLAMA_TAGS_URL = "https://ollama.com/api/tags";
export declare const OLLAMA_ME_URL = "https://ollama.com/api/me";
export declare const OLLAMA_KEYS_URL = "https://ollama.com/settings/keys";
/** Official docs: API keys do not expire. */
export declare const OLLAMA_NEVER_EXPIRES = 8640000000000000;
export declare const OLLAMA_DEFAULT_CONTEXT = 128000;
export declare const OLLAMA_DEFAULT_MAX_TOKENS = 16384;
export declare const OLLAMA_TEXT_INPUT: readonly string[];
export declare const OLLAMA_VISION_INPUT: readonly string[];
/**
 * DSH picker keys → Ollama OpenAI-compat wire
 * (`reasoning_effort` / `effort`: high|medium|low|max|none).
 * Never use a vendor spelling as a key.
 */
export declare const OLLAMA_REASONING: Readonly<{
    off: "none";
    low: "low";
    medium: "medium";
    high: "high";
    max: "max";
}>;
export declare const OLLAMA_SOURCES: readonly string[];
/**
 * Official Cloud retirement table (docs.ollama.com/cloud). Upcoming
 * 2026-07-31 rows are already past as of this family. Do not list them.
 */
export declare const OLLAMA_RETIRED_MODELS: Readonly<Set<string>>;
export declare function inferOllamaInput(id: any): string[];
export declare function inferOllamaContextWindow(id: any): 128000 | 200000 | 256000 | 262144;
/** 19-row Cloud snapshot from GET /api/tags (same 19 as /v1/models). Live tags replace this after login. */
export declare const OLLAMA_MODELS: readonly {
    id: any;
    name: any;
    contextWindow: number;
    maxTokens: number;
    input: string[];
    reasoningEfforts: Readonly<{
        off: "none";
        low: "low";
        medium: "medium";
        high: "high";
        max: "max";
    }>;
}[];
export declare function ollamaSourceLabel(source: any): "key" | "env";
export declare function parseOllamaApiKey(value: any): string;
/** Stable vault id that is not the raw key. */
export declare function ollamaAccountFingerprint(key: any): string;
export declare function ollamaDefaultAccount(key: any): string;
export declare function isOllamaRetiredModel(id: any): boolean;
export declare function ollamaPrettyName(id: any): string;
export declare function ollamaSession({ accessToken, account, source, }?: {
    source?: string;
}): {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    source: string;
};
export declare function refreshOllama(session: any): Promise<any>;
export declare function isOllamaPermanentRefreshError(): boolean;
export declare function ollamaUpstreamHeaders(session: any): {
    authorization: string;
};
export declare function resolveOllamaIdentity(session: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<string>;
