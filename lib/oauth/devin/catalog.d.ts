/**
 * Devin model catalog. Live rows come from
 * `ApiServerService/GetCliModelConfigs` — 200+ `ClientModelConfig` entries
 * covering every effort tier of every family. The picker is projected as one
 * row per (family × modifier bucket): effort is a `chat_model_uid` suffix
 * upstream, so each row carries `variants: { effortKey → uid }` and the
 * family default (`is_default_model_in_family`) as `defaultUid`.
 *
 * Row id = family uid (`swe-2`), with `-thinking` / `-fast` / `-priority` /
 * `-1m` appended for configs whose label marks that bucket. A raw uid
 * (`swe-2-high`) still resolves as-is — `devinWireModelId` falls through.
 */
/**
 * Label suffix after the family label, e.g. "Claude Opus 5" + "Low Fast"
 * → { effort: 'low', mods: ['fast'] }. "Thinking" is a bucket of its own
 * unless an effort word is also present ("… Medium Thinking" = effort only).
 */
export declare function devinLabelVariant(label: any, familyLabel: any): {
    effort: any;
    thinking: boolean;
    mods: any[];
};
/**
 * Collapse ClientModelConfig[] into picker rows. Internal rows carry
 * `variants` + `defaultUid`; `toHarnessModel` projects only the public fields.
 */
export declare function toDevinPickerModels(configs: any): any[];
export declare function devinCatalogModels(): any;
export declare function devinModelById(id: any): any;
/** Some Devin rows declare efforts; the provider compat key must not 400 them. */
export declare function devinHasEffort(): any;
/**
 * POST ApiServerService/GetCliModelConfigs (unary application/proto, raw body).
 * Returns the decoded ClientModelConfig list; throws on transport errors.
 */
export declare function devinListModelConfigs(session: any, { fetchFn, signal }?: any): Promise<any>;
/**
 * Refresh the in-memory catalog. Live rows win when any survive filtering;
 * the static floor stays when the RPC fails or returns nothing usable.
 */
export declare function refreshDevinCatalog(session: any, { fetchFn, signal }?: any): Promise<any>;
export declare function setDevinCatalogModels(rows: any): any;
export declare function resetDevinCatalog(): void;
export declare function describeDevinCatalogError(error: any): string;
