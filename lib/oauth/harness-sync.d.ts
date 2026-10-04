/**
 * Write this plugin's routes into the host: the atomic llm-pi-ai settings
 * mutate (only owned provider ids are replaced), the OpenCode Go route that
 * lives on the host's own key env, and the compaction headroom block in the
 * profile's cordis.patch.yml.
 */
export declare function filterProviders(providers: Record<string, any>, selected: any): Record<string, any>;
/** `undefined` when the host cannot describe llm-pi-ai; `{}` when its providers are empty. */
export declare function peekPiAiProviders(settings: any): Promise<any>;
/**
 * Ensure OpenCode Go is configured while only supplying what the installed
 * catalog lacks.
 *
 * DSH's built-in `opencode-go` catalog provider carries the other 27 official
 * models, but llm-pi-ai registers a catalog route only when a profile names
 * it — so a plugin-written `providers.opencode-go` profile is what silently
 * put all 27 models into DSH's model list. The plugin no longer creates or
 * refreshes it: the user enables that route from DSH's own Models page if
 * they want it. Only the exact profile older plugin versions auto-wrote
 * (apiKeyEnv + session header, no api/models) is taken back so an upgrade
 * stops showing it; every other shape is a user profile and is untouched.
 *
 * The plugin writes its own complete catalog on one route per wire protocol
 * (`opencode-go-flash` completions + `opencode-go-responses`), so the picker
 * shows every official Go model even when DSH's built-in route is not enabled.
 * Each route follows the picker (`selected` undefined = all) and carries the
 * required `x-opencode-session` header. Without `OPENCODE_API_KEY` nothing is
 * served, so DSH's model list stays clean.
 */
export declare function ensureOpencodeGoRoute(settings: any, { selected, apiKeySet, contexts, efforts, apply }?: any): Promise<{
    status: string;
    routes?: undefined;
    mutations?: undefined;
    error?: undefined;
} | {
    status: string;
    routes: any[];
    mutations: any[];
    error?: undefined;
} | {
    status: string;
    error: string;
    routes?: undefined;
    mutations?: undefined;
} | {
    status: string;
    routes: any[];
    mutations?: undefined;
    error?: undefined;
}>;
/**
 * Family model lists come from the registry (familyCatalogInputs), not a
 * per-call parameter bag: the controller passes only `glmModels`, the one
 * session-sequenced seat it resolves itself (`#glmModels`); every other
 * family's rows are read here through its own registry row, so no family can
 * be dropped from one caller's bag again. Without `glmModels`, models.ts
 * falls back to its static GLM_MODELS floor.
 */
export declare function syncHarnessModels({ settings, patchPath, prefix, origin, loggedIn, selected, glmModels, contexts, efforts, extraMutations }: any): Promise<{
    routes: {
        provider: string;
        api: any;
        models: any;
    }[];
    compaction: {
        status: string;
        error?: undefined;
        policies?: undefined;
    } | {
        status: string;
        error: string;
        policies?: undefined;
    } | {
        status: string;
        policies: number;
        error?: undefined;
    };
}>;
/**
 * Distinct tmp name per write: overlapping sync() calls in this process
 * must not share one (the second rename would hit ENOENT).
 */
export declare function compactionTmpPath(patchPath: any): string;
