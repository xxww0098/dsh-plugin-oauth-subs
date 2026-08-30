/**
 * On-disk OAuth session store at `<dataDir>/auth.json`.
 *
 * The file is a JSON object keyed by provider id. Writes are atomic
 * (tmp file + rename) with mode 0600 because they carry bearer tokens.
 */
export declare const PROVIDER_IDS: readonly string[];
export declare function defaultDataDir(): string;
export declare function authFilePath(dataDir?: string): string;
export declare function readPrivateText(path: any, label: any, { allowBroadMode }?: {
    allowBroadMode?: boolean;
}): Promise<any>;
export declare function writePrivateText(path: any, text: any): Promise<void>;
export declare function loadStore(path: any): Promise<any>;
export declare function getSession(provider: any, path: any): Promise<any>;
export declare function saveSession(provider: any, session: any, path: any): Promise<any>;
export declare function deleteSession(provider: any, path: any): Promise<any>;
export declare function publicSession(provider: any, session: any): {
    account: any;
    planType: any;
    planLabel: any;
    expiresAt: any;
    scopes?: undefined;
} | {
    account: any;
    planType: any;
    planLabel: any;
    scopes: any;
    expiresAt: any;
};
