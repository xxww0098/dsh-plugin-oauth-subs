/**
 * Private (0600) text-file helpers shared by the oauth and apikey modules.
 * Extracted from oauth/store.ts so apikey does not import the OAuth store.
 */
export declare function readPrivateText(path: any, label: any, { allowBroadMode }?: {
    allowBroadMode?: boolean;
}): Promise<any>;
export declare function writePrivateText(path: any, text: any): Promise<void>;
