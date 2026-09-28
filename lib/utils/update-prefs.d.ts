/**
 * Auto-update preference + last-run outcome, persisted in the plugin data
 * dir (`update-prefs.json` / `update-state.json` next to auth.json). Desktop
 * specialization: self-install is the only update path, so the pref is a
 * single boolean and the state is the last install attempt's result.
 */
/** 15-minute cadence — the cadence the About card advertises. */
export declare const AUTO_UPDATE_INTERVAL_MS: number;
export declare const updatePrefsPath: (authPath: any) => string;
export declare const updateStatePath: (authPath: any) => string;
export declare function readUpdatePrefs(path: any): Promise<{
    autoUpdate: boolean;
}>;
export declare const writeUpdatePrefs: (path: any, prefs: any) => Promise<void>;
export declare function readUpdateState(path: any): Promise<any>;
export declare const writeUpdateState: (path: any, state: any) => Promise<void>;
