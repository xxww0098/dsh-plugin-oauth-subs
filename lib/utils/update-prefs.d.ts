/**
 * Persist About-page auto-update checkboxes.
 * Keys are independent: plugin GitHub release vs npm @deepseek-ai/dsh.
 */
export declare const UPDATE_PREFS_FILE = "update-prefs.json";
export declare const AUTO_UPDATE_INTERVAL_MS: number;
export declare function defaultUpdatePrefs(): {
    plugin: boolean;
    dsh: boolean;
};
export declare function updatePrefsPath(dataDir: any): string;
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
