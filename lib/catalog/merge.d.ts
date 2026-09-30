/**
 * Diff / merge of one catalog key: the rows in `src/catalog/models.json`
 * against rows normalized from that family's model source. Pure (no I/O, no
 * family imports) so `scripts/models.ts` and the tests share one rule set.
 * The rules are the contract written in `docs/models.md` (合并规则):
 *
 * - `name` is curated: a source name only lands on a new row.
 * - A field the source leaves `undefined` keeps the catalog value; sources
 *   rarely carry every field (Codex has no output cap, Grok no input kinds).
 * - A `keep` rule pins a maintainer decision (a default input tier below the
 *   vendor's total window, say): the difference is reported, never applied.
 * - Existing rows keep their order (it is the picker order); new rows go on
 *   top, in source order, so the newest models lead the picker.
 * - A catalog row the source no longer lists is `missing`; it is dropped only
 *   with `prune`, because many sources are account- or egress-filtered.
 * - A source row carrying nothing beyond `id` / `name` cannot become a row:
 *   an existing row stays as is, a new id is `unresolved`.
 * - `add: false` reports new ids as `notAdded` without writing them, for keys
 *   whose static rows are curated from another source (Cursor's floor follows
 *   the docs table while the live list also carries hidden and legacy ids).
 * - A `skip` rule drops a source id on purpose (served by the source but
 *   deliberately kept out of the picker); it is reported with its reason.
 */
export interface KeepRule {
    /** Row ids the rule covers; omitted = every row of the key. */
    ids?: readonly string[];
    fields: readonly string[];
    why: string;
}
export interface SkipRule {
    ids: readonly string[];
    why: string;
}
export interface MergeOptions {
    keep?: readonly KeepRule[];
    skip?: readonly SkipRule[];
    prune?: boolean;
    /** false = report new ids as `notAdded`, never add them. Default true. */
    add?: boolean;
    /** Fills fields a source cannot supply on a newly added row. */
    newRow?: (row: any) => any;
}
export interface FieldChange {
    id: string;
    field: string;
    from: unknown;
    to: unknown;
}
export interface MergeResult {
    rows: any[];
    added: any[];
    changed: FieldChange[];
    kept: (FieldChange & {
        why: string;
    })[];
    missing: string[];
    removed: string[];
    unresolved: any[];
    notAdded: any[];
    skipped: {
        id: string;
        why: string;
    }[];
}
/** Field equality as the harness sees it: key order and input order do not matter. */
export declare function sameField(field: string, left: unknown, right: unknown): boolean;
export declare function mergeCatalogRows(existing: readonly any[], offered: readonly any[], options?: MergeOptions): MergeResult;
