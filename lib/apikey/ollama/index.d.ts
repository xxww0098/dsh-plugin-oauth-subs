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
export declare const OLLAMA_SHOW_URL = "https://ollama.com/api/show";
export declare const OLLAMA_ME_URL = "https://ollama.com/api/me";
export declare const OLLAMA_USAGE_URL = "https://ollama.com/api/usage";
export declare const OLLAMA_KEYS_URL = "https://ollama.com/settings/keys";
/** ollama.com /api/me Plan slugs. Not Codex `pro` → Pro 20x. */
export declare const OLLAMA_PLAN_NAMES: Readonly<{
    free: "Free";
    hobby: "Hobby";
    plus: "Plus";
    pro: "Pro";
    max: "Max";
    team: "Team";
    enterprise: "Enterprise";
}>;
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
/** Last-resort name regex when POST /api/show has no `capabilities`. */
export declare function inferOllamaInput(id: any): string[];
/**
 * DSH picker `input` from POST /api/show `capabilities`.
 * `vision` (any case) → text+image. Missing `capabilities` → undefined
 * so the catalog can fall back to `inferOllamaInput`. Never invent audio.
 */
export declare function ollamaShowInput(show: any): string[];
export declare function ollamaInput(id: any, show: any): string[];
/** `model_info.<family>.context_length` from POST /api/show, or a later tags field. */
export declare function ollamaShowContextLength(value: any): number;
export declare function ollamaSnapshotContextWindow(id: any): any;
/**
 * DSH picker window: live show/tags `context_length`, else the pinned Cloud
 * snapshot. Last resort for an unknown new tag is OLLAMA_DEFAULT_CONTEXT —
 * not a family-size regex (128k/200k/256k).
 */
export declare function ollamaContextWindow(id: any, show: any): any;
/**
 * 19-row Cloud snapshot. Windows are 2026-09-03 POST /api/show
 * `model_info.*.context_length`. `input` is that day's `capabilities`
 * (`vision` → text+image). Live tags+show replace this after login.
 */
export declare const OLLAMA_MODELS: readonly {
    id: any;
    name: any;
    contextWindow: any;
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
/** Vault / card title before /api/me Email lands. */
export declare function isOllamaOpaqueAccount(value: any): boolean;
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
/** Live /api/me is PascalCase (`Email`, `Name`, `Plan`). GET is 405. */
export declare function parseOllamaMe(value: any): {
    planType?: string;
    account?: string;
};
export declare function resolveOllamaIdentity(session: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    planType?: string;
    account?: string;
}>;
