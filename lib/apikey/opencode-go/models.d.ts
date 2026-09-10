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
export declare const OPENCODE_GO_OPENAI_BASE_URL = "https://opencode.ai/zen/go/v1";
export declare const OPENCODE_GO_ANTHROPIC_BASE_URL = "https://opencode.ai/zen/go";
/** @ai-sdk/openai-compatible - POST {baseURL}/chat/completions */
export declare const OPENCODE_GO_COMPLETIONS: {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: any[];
}[];
/** @ai-sdk/openai - POST {baseURL}/responses */
export declare const OPENCODE_GO_RESPONSES: {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: any[];
}[];
/** @ai-sdk/anthropic - Anthropic SDK posts {baseURL}/v1/messages */
export declare const OPENCODE_GO_ANTHROPIC: {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: any[];
}[];
/**
 * The three DSH routes OpenCode Go needs: DSH llm-pi-ai is one provider =
 * one api, while Go serves the same subscription over three protocols.
 */
export declare const OPENCODE_GO_ROUTES: readonly {
    id: string;
    displayName: string;
    api: string;
    baseURL: string;
    models: {
        id: any;
        name: any;
        contextWindow: any;
        maxTokens: any;
        input: any[];
    }[];
}[];
export declare const OPENCODE_GO_MODEL_COUNT: number;
