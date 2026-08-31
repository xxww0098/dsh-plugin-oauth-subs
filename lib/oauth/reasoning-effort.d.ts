/**
 * Remember the last explicit reasoning effort on oauth-* families and put it
 * back after DSH's model picker drops `reasoningEffort` (Default = omitted).
 *
 * YAML `agent-default-model` alone does not move the live composer: the picker
 * reads the session `model/selection` event from `selectForNextRequest`.
 * Prefer `sessionController.selectModel` so that path runs with the effort.
 */
export declare const AGENT_DEFAULT_MODEL_NS = "agent-default-model";
export declare const LAST_EFFORT_FILE = "reasoning-effort.json";
export declare const SETTINGS_UPDATED = "settings/updated";
export declare const SETTINGS_DOCUMENT_UPDATED = "settings/document-updated";
export declare function isOwnedOauthProvider(prefix: any, provider: any): boolean;
export declare function isRememberableEffort(value: any): boolean;
export declare function isDefaultishEffort(value: any): boolean;
/**
 * Keep the remembered key when the model declares it. `xhigh` / `max` that
 * the model does not list fall to the highest key it does declare.
 * `reasoningEfforts: false` and unknown keys stay unset.
 */
export declare function compatibleEffort(remembered: any, reasoningEfforts: any): any;
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
export declare function snapshotSelection(value: any): {
    provider: any;
    model: any;
    reasoningEffort: any;
};
export declare function lastModelSelection(session: any): any;
/**
 * Re-run host selectModel (selectForNextRequest + saveSelection) with the
 * effort. Falls back to saveSelection / mutate YAML when the session API is
 * missing — that updates future sessions, not the current composer.
 */
export declare function applyRestoredSelection(host: any, selection: any): Promise<{
    via: string;
    sessions: number;
    livePicker: boolean;
}>;
export declare function startEffortRestore({ ctx, settings, memory, prefix, effortsFor }: {
    ctx: any;
    settings: any;
    memory: any;
    prefix: any;
    effortsFor: any;
}): () => void;
