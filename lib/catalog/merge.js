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
const INPUT_ORDER = ['text', 'image'];
/** What a row without `input` means to the harness. */
const DEFAULT_INPUT = ['text', 'image'];
const IDENTITY_FIELDS = new Set(['id', 'name']);
function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value) ?? 'undefined';
}
function comparable(field, value) {
    if (field !== 'input')
        return value;
    const kinds = Array.isArray(value) ? value : DEFAULT_INPUT;
    return INPUT_ORDER.filter((kind) => kinds.includes(kind));
}
/** Field equality as the harness sees it: key order and input order do not matter. */
export function sameField(field, left, right) {
    return canonical(comparable(field, left)) === canonical(comparable(field, right));
}
function withoutUndefined(row) {
    return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}
function hasMetadata(row) {
    return Object.keys(row).some((key) => !IDENTITY_FIELDS.has(key) && row[key] !== undefined);
}
function keepRuleFor(keep, id, field) {
    return keep.find((rule) => (!rule.ids || rule.ids.includes(id)) && rule.fields.includes(field));
}
export function mergeCatalogRows(existing, offered, options = {}) {
    const { keep = [], skip = [], prune = false, add = true, newRow } = options;
    const result = { rows: [], added: [], changed: [], kept: [], missing: [], removed: [], unresolved: [], notAdded: [], skipped: [] };
    const source = [];
    for (const row of offered) {
        const rule = skip.find((entry) => entry.ids.includes(row.id));
        if (rule)
            result.skipped.push({ id: row.id, why: rule.why });
        else
            source.push(row);
    }
    const bySource = new Map(source.map((row) => [row.id, row]));
    const known = new Set(existing.map((row) => row.id));
    for (const row of existing) {
        const incoming = bySource.get(row.id);
        if (!incoming) {
            result.missing.push(row.id);
            if (prune)
                result.removed.push(row.id);
            else
                result.rows.push(row);
            continue;
        }
        const next = { ...row };
        let touched = false;
        for (const [field, value] of Object.entries(incoming)) {
            if (IDENTITY_FIELDS.has(field) || value === undefined || sameField(field, row[field], value))
                continue;
            const rule = keepRuleFor(keep, row.id, field);
            if (rule) {
                result.kept.push({ id: row.id, field, from: row[field], to: value, why: rule.why });
                continue;
            }
            result.changed.push({ id: row.id, field, from: row[field], to: value });
            next[field] = value;
            touched = true;
        }
        result.rows.push(touched ? next : row);
    }
    const fresh = [];
    for (const row of source) {
        if (known.has(row.id))
            continue;
        if (!add) {
            result.notAdded.push(withoutUndefined(row));
            continue;
        }
        if (!hasMetadata(row)) {
            result.unresolved.push(withoutUndefined(row));
            continue;
        }
        const added = withoutUndefined(newRow ? newRow(row) : row);
        result.added.push(added);
        fresh.push(added);
    }
    result.rows = [...fresh, ...result.rows];
    return result;
}
