/**
 * Persisted Settings picker state: which catalog keys are on, per-model
 * context-window overrides, and per-family default reasoning effort.
 */
/** Levels the Models page offers as a family's default effort. */
export declare const DEFAULT_EFFORT_LEVELS: readonly string[];
/**
 * Persisted enable/disable set for the Settings picker.
 * Default is all-on for families whose login has already been settled.
 * New non-opt-in catalog ids stay on. Explicit picker choices persist across
 * restarts so automatic recovery cannot mistake all-off for leftover settings.
 *
 * 登录默认: a family that signs in while this plugin is running starts with
 * every catalog row off (`awaitingPick`) — a fresh login must not flood DSH's
 * model list. Families already signed in when the plugin started are seeded
 * into `seenLogins` and keep whatever the user had, so an upgrade never turns
 * an existing install's models off. The first explicit pick for the family
 * clears `awaitingPick` and leaves `seenLogins` in place, so a later
 * re-login never re-applies the default over the user's selection.
 */
export declare class ModelSwitch {
    #private;
    path: string | undefined;
    disabled: Set<string>;
    enabled: Set<string>;
    contexts: Record<string, number>;
    efforts: Record<string, string>;
    seenLogins: Set<string>;
    awaitingPick: Set<string>;
    ready: Promise<any>;
    constructor({ path }?: any);
    load(): Promise<void>;
    save(): Promise<void>;
    /**
     * Default effort per family (`null` clears); `withDefaultEffort` writes it
     * at sync. No `families` means every family: the 全部 control unifies
     * whatever single families were set to.
     */
    setEffort(level: any, families?: readonly string[]): Promise<void>;
    isEnabled(key: any): boolean;
    /**
     * Startup seeding: every family already signed in when this plugin instance
     * started is `seen`, so the login default below only ever hits logins that
     * happen while this code runs. Returns whether the persisted set changed.
     */
    seedSeenLogins(families: any): Promise<boolean>;
    /**
     * 登录默认: every row of a family that signs in while this plugin runs is
     * left off until the user picks something for that family — a family's whole
     * catalog must not land in DSH's model list just because it signed in. Rows
     * the catalog discovers before that pick stay off too; the first explicit
     * pick (toggle / family / all / selected) drops the family back into the
     * ordinary default-on rules. Returns whether the persisted state changed.
     */
    applyLoginDefaults(catalog: any, loggedIn: any): Promise<boolean>;
    /** The custom input-context window for a key, or undefined (catalog default). */
    contextOf(key: any): number;
    /**
     * Set (or reset with `null`) a per-model input-context window. The catalog
     * must be an un-overridden build: the row's own maximum (`maxContextWindow`
     * ceiling, else its window) caps the value. Not an enable choice:
     * `selectionExplicit` stays untouched so all-off recovery semantics are
     * unaffected. Unknown keys throw so the RPC surfaces them.
     */
    setContext(key: any, tokens: any, catalog: any): Promise<void>;
    /** Clear every custom input-context override at once (恢复默认). */
    resetContexts(): Promise<void>;
    enabledKeys(catalog: any): any[];
    selectedForSync(catalog: any): any[] | undefined;
    status(catalog: any): {
        selected: any[];
        disabled: any[];
        allOn: boolean;
    };
    setEnabled(keys: any, catalog: any): Promise<{
        selected: any[];
        disabled: any[];
        allOn: boolean;
    }>;
    toggle(key: any, on: any, catalog: any): Promise<{
        selected: any[];
        disabled: any[];
        allOn: boolean;
    }>;
    setFamily(family: any, on: any, catalog: any): Promise<{
        selected: any[];
        disabled: any[];
        allOn: boolean;
    }>;
    /**
     * Leftover 全关: every *current* catalog key for a signed-in family is
     * off (often after a catalog shrink left stale ids in `disabled`).
     * Enable the current keys so login/sync can write the DSH route.
     * Only unmarked settings need recovery; an explicit picker choice stays off.
     * Does not resurrect retired ids or opt-in context variants.
     */
    recoverEmptyLoggedInFamilies(catalog: any, loggedIn: any): Promise<boolean>;
    setAll(on: any, catalog: any): Promise<{
        selected: any[];
        disabled: any[];
        allOn: boolean;
    }>;
}
