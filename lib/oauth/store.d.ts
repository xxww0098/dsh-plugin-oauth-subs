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
export declare function accountIdOf(provider: any, session: any): any;
export declare function asVault(provider: any, entry: any): {
    activeId: any;
    accounts: {};
};
export declare function loadStore(path: any): Promise<any>;
export declare function getSession(provider: any, path: any): Promise<any>;
export declare function listAccounts(provider: any, path: any): Promise<({
    account: any;
    planType: any;
    planLabel: any;
    expiresAt: any;
    region?: undefined;
    scopes?: undefined;
    id: string;
    active: boolean;
} | {
    account: any;
    planType: any;
    planLabel: any;
    region: string;
    expiresAt: any;
    scopes?: undefined;
    id: string;
    active: boolean;
} | {
    account: any;
    planType: any;
    planLabel: any;
    scopes: any;
    expiresAt: any;
    region?: undefined;
    id: string;
    active: boolean;
})[]>;
export declare function saveSession(provider: any, session: any, path: any): Promise<any>;
export declare function switchAccount(provider: any, id: any, path: any): Promise<any>;
export declare function deleteSession(provider: any, path: any, id: any): Promise<any>;
export declare function publicSession(provider: any, session: any): {
    account: any;
    planType: any;
    planLabel: any;
    expiresAt: any;
    region?: undefined;
    scopes?: undefined;
} | {
    account: any;
    planType: any;
    planLabel: any;
    region: string;
    expiresAt: any;
    scopes?: undefined;
} | {
    account: any;
    planType: any;
    planLabel: any;
    scopes: any;
    expiresAt: any;
    region?: undefined;
};
