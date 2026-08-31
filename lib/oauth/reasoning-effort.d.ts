/**
 * Remember the last reasoning effort the user picked on an oauth-* family
 * and put it back when DSH's model switch drops `agent-default-model.reasoningEffort`.
 */
export declare const AGENT_DEFAULT_MODEL_NS = "agent-default-model";
export declare const LAST_EFFORT_FILE = "reasoning-effort.json";
export declare function isOwnedOauthProvider(prefix: any, provider: any): boolean;
export declare function isRememberableEffort(value: any): boolean;
export declare function isDefaultishEffort(value: any): boolean;
/**
 * Keep the remembered key when the model declares it. `xhigh` / `max` that
 * the model does not list fall to the highest key it does declare.
 * `reasoningEfforts: false` and unknown keys stay unset.
 */
export declare function compatibleEffort(remembered: any, reasoningEfforts: any): any;
export declare function providerReasoning(remembered: any, models: any): any;
export declare function decideEffortAction({ selection, previous, remembered, prefix, efforts }: {
    selection: any;
    previous: any;
    remembered: any;
    prefix: any;
    efforts: any;
}): {};
export declare class EffortMemory {
    constructor({ path }?: {});
    last(): any;
    load(): Promise<void>;
    remember(effort: any): Promise<void>;
    save(): Promise<void>;
}
/**
 * Prefer `settings.watch('agent-default-model', cb)` when the host exposes it.
 * DSH 0.1.x only watches via `register()` (already owned by agent-default-model),
 * so we poll `settings.get` — `saveSelection` already writes that namespace.
 */
export declare function attachDefaultModelWatch(settings: any, onChange: any, { intervalMs }?: {
    intervalMs?: number;
}): () => void;
export declare function startEffortRestore({ settings, memory, prefix, effortsFor }: {
    settings: any;
    memory: any;
    prefix: any;
    effortsFor: any;
}): () => void;
