/**
 * Persist About-page auto-update checkboxes.
 * Keys are independent: plugin GitHub release vs npm @deepseek-ai/dsh.
 *
 * update-state.json sits beside it and records the last automatic run
 * (time + per-channel outcome) so the About page can show that auto-update
 * is alive — manual clicks never write it.
 */
export declare const UPDATE_PREFS_FILE = "update-prefs.json";
export declare const UPDATE_STATE_FILE = "update-state.json";
export declare const AUTO_UPDATE_INTERVAL_MS: number;
export declare function defaultUpdatePrefs(): {
    plugin: boolean;
    dsh: boolean;
};
export declare function updatePrefsPath(dataDir: any): string;
export declare function updateStatePath(dataDir: any): string;
export declare function normalizeUpdatePrefs(raw: any): {
    plugin: boolean;
    dsh: boolean;
};
export declare function readUpdatePrefs(path: any): Promise<{
    plugin: boolean;
    dsh: boolean;
}>;
export declare function writeUpdatePrefs(path: any, prefs: any): Promise<{
    plugin: boolean;
    dsh: boolean;
}>;
/**
 * Fold one channel's checkUpdate/checkDshUpdate result into a lastRun entry.
 * 'installed' means the apply landed (a restart follows); 'update' means a
 * newer version exists but nothing was installed (github-only, or apply
 * skipped); 'failed' covers apply failure/timeout/unchanged and check errors.
 */
export declare function autoRunOutcome(result: any): {
    version?: string | undefined;
    status: string;
};
export declare function normalizeUpdateState(raw: any): {
    dsh?: {
        status: any;
        version: any;
    } | {
        status: any;
        version?: undefined;
    } | undefined;
    plugin?: {
        status: any;
        version: any;
    } | {
        status: any;
        version?: undefined;
    } | undefined;
    at?: any;
};
export declare function readUpdateState(path: any): Promise<{
    dsh?: {
        status: any;
        version: any;
    } | {
        status: any;
        version?: undefined;
    } | undefined;
    plugin?: {
        status: any;
        version: any;
    } | {
        status: any;
        version?: undefined;
    } | undefined;
    at?: any;
}>;
export declare function writeUpdateState(path: any, state: any): Promise<{
    dsh?: {
        status: any;
        version: any;
    } | {
        status: any;
        version?: undefined;
    } | undefined;
    plugin?: {
        status: any;
        version: any;
    } | {
        status: any;
        version?: undefined;
    } | undefined;
    at?: any;
}>;
