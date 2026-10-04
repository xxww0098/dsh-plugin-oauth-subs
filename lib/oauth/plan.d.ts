/**
 * Pretty-print ChatGPT / Codex plan_type and Grok subscription_tier for the
 * Settings card. Raw slugs stay on the wire (`plus`, numeric JWT tier);
 * the UI shows Plus / Pro 20x / Pro 5x / SuperGrok / X Premium+.
 */
/** Slug → Settings-card label. A widened view of each family's frozen plan table so a runtime slug can index it. */
type PlanNameTable = Readonly<Record<string, string>>;
export declare const CODEX_PLAN_NAMES: PlanNameTable;
export declare function formatPlanLabel(raw: unknown, family?: string): string | undefined;
export declare function pickPlanRaw(...values: unknown[]): number | string | undefined;
export {};
