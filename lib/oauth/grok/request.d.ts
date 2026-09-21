/**
 * Shape DSH openai-responses bodies for xAI Grok.
 *
 * grok-build (xai-org/grok-build) sends `instructions: null` and keeps
 * system in `input`. Prefix cache stays hot only when later turns replay
 * that order byte for byte. DSH prepends a fresh developer/system snapshot
 * every step; those extras park at the input suffix, same idea as Codex
 * but without lifting into top-level `instructions`.
 *
 * Model id hygiene also lives here: Grok Fast is a real backend model
 * (`grok-4.7-build-fast`), so the shared Codex `applyFastMode` peel must
 * not run on the Grok hop. Stale `grok-4.6-fast`-style aliases still get
 * peeled, and `service_tier` never reaches xAI.
 *
 * Cache identity lives in `./cache.ts`.
 */
/**
 * Grok Fast is a real model id (`grok-4.7-build-fast`), not Codex Priority,
 * so the shared `applyFastMode` peel is bypassed for this family. A stale
 * host alias (`grok-4.6-fast`) is still peeled so xAI cannot 400 on a fake
 * model, and `service_tier` is stripped (xAI never takes it).
 */
export declare function normalizeGrokModel(payload: any): any;
export declare function normalizeGrokResponsesBody(payload: any): any;
