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
export declare function normalizeGrokResponsesBody(payload: any): any;
