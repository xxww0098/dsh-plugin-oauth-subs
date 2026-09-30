/**
 * Private (0600) text-file helpers shared by the oauth and apikey modules.
 * Extracted from oauth/store.ts so apikey does not import the OAuth store.
 */
export declare function readPrivateText(path: any, label: any, { allowBroadMode }?: {
    allowBroadMode?: boolean | undefined;
}): Promise<any>;
export declare function writePrivateText(path: any, text: any): Promise<void>;
/**
 * Append one line to a private (0600) diagnostic log, rotating it to `.1`
 * past `maxBytes` (one generation kept). Not state: a torn line loses only
 * itself, so no temp file + rename.
 */
export declare function appendPrivateLine(path: any, line: any, maxBytes?: number): Promise<void>;
