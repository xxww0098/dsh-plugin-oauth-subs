/**
 * Live picker for Sign in with ChatGPT: `GET api.openai.com/v1/models` with
 * the account's access token (siwc models-and-inference). Keep
 * `visibility: "list"` rows; `slug` is the wire id and
 * `display_name` the label. CHATGPT_MODELS is the offline floor only.
 *
 * Numbers come from the live row when it carries them, else from the static
 * row with the same slug. A live row with no window from either source is
 * left out rather than given an invented one.
 */
export declare const CHATGPT_CATALOG_TTL_MS: number;
export declare function resetChatgptCatalogCache(): void;
export declare function chatgptCatalogModels(): any[];
export declare function toChatgptPickerModels(payload: any): any[];
export declare function refreshChatgptCatalog(session: any, options?: any): Promise<any[]>;
