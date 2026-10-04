/**
 * Family registry: the one table keyed by family id that the central
 * per-family dispatchers look up instead of growing `family === '<id>'`
 * chains — today the inbound cache rewrite (proxy-body.ts), the quota
 * fetch (quota.ts QuotaStore), the account-quota hydration hooks
 * (account-quota.ts), the login flow / paste completion / pasted-key
 * dispatch (login.ts), the passthrough Completions usage rewrite
 * (passthrough.ts), and the model-catalog bag every llm-pi-ai projection
 * consumes (familyCatalogInputs below; models.ts / harness-sync.ts).
 *
 * Contract (docs/rules.md):
 * - A row holds ONLY references to functions defined in the family folder
 *   (`src/oauth/<id>/`, `src/apikey/<id>/`) plus thin composition glue that
 *   mirrors what the old dispatch branch did. Never copy or re-implement a
 *   family function here; new vendor behavior belongs in that family's
 *   folder and a row references it. This file must not accrete vendor logic.
 * - Cache and session identity stay family-owned: every cache rewrite and
 *   session id below is computed by the family's own cache.ts, families
 *   never share cache helpers or ids, and nothing here invents ids (no
 *   Date.now()/random in a session-id position).
 * - `proxy.ts` keeps its explicit per-family route blocks (sanctioned
 *   style); every other central dispatcher imports a row from this table.
 */
import type { AuthController } from './controller.js';
export type FamilyId = 'codex' | 'chatgpt' | 'grok' | 'glm' | 'kiro' | 'antigravity' | 'cursor' | 'ollama' | 'kimi' | 'copilot' | 'devin' | 'cline' | 'command-code';
/** One family's inbound cache rewrite; extra keys ride along to the hop. */
export interface FamilyCacheRewrite {
    payload: any;
    cacheSessionId?: string;
    [extra: string]: unknown;
}
/** refreshQuota: re-read this family's own model list, re-sync when it changed. */
export interface FamilyCatalogDiscovery {
    /** Current catalog rows; ids compared before/after discovery. */
    models: () => {
        id: string;
    }[];
    /** Kiro only: the catalog follows the egress region, so a manual refresh re-asks. */
    reset?: () => void;
    /** Catalog discovery for one stored account's session. */
    run: (ctl: AuthController, session: any) => unknown;
}
/** Per-account quota side effects driven by src/oauth/account-quota.ts. */
export interface FamilyQuotaHooks {
    /** ensureAccountQuota: identity/plan write-back after one row's reading hydrated. */
    afterEnsure?: (ctl: AuthController, row: any, quota: any) => unknown;
    /** refreshQuota: per-row identity write-back (quota.peek of that row). */
    remember?: (ctl: AuthController, row: any, quota: any) => unknown;
    /** refreshQuota: per-row probe that needs no quota reading (Antigravity validation). */
    probe?: (ctl: AuthController, row: any) => unknown;
    /** refreshQuota: re-read the account's own model list; see FamilyCatalogDiscovery. */
    discover?: FamilyCatalogDiscovery;
    /** refreshQuota: the hooks above may rewrite stored rows — re-list them before peeking. */
    relistAccountsAfterRefresh?: boolean;
}
/**
 * Per-family passthrough forward hooks driven by src/oauth/passthrough.ts:
 * Completions usage rewriting on the forwarded answer. The mappers and the
 * envelope unwrap stay in each family's own request.ts; a row only
 * references them (same contract as every other field on the row).
 */
export interface FamilyForwardHooks {
    /**
     * Resolve this request's Completions usage mapper; undefined = forward
     * the usage object untouched. GLM maps its chat wire only — Anthropic
     * usage is native already.
     */
    completionsUsage?: (wire?: string) => ((usage: any) => any) | undefined;
    /** Unwrap a non-streaming Completions body before usage mapping (Cline `{success, data}`). */
    unwrapCompletionsBody?: (parsed: any) => any;
}
/**
 * Per-family login hooks driven by src/oauth/login.ts: the flow start
 * (login), the loopback-paste completion (completePkce), and pasted keys
 * (useKey). The bodies live in each family's own accounts.ts; a row only
 * references them (same contract as every other field on the row).
 */
export interface FamilyLoginHooks {
    /** login(): start this family's browser / device / CLI flow. */
    attempt: (ctl: AuthController, payload: any) => unknown;
    /** completePkce(): this family's loopback-callback completion, when it has one. */
    completePaste?: FamilyPasteHooks;
    /** useKey(): accept a pasted key / CLI credential, when this family takes one. */
    useKey?: (ctl: AuthController, key: any, payload: any) => unknown;
    /** importLocal(): read this family's local CLI/IDE credential store. */
    importLocal?: (ctl: AuthController) => Promise<any>;
}
/** completePkce hooks: the code exchange plus the family's save-time side effects. */
export interface FamilyPasteHooks {
    /** Exchange the loopback code for a session (family index.ts owns the endpoint). */
    exchange: (ctl: AuthController, code: any, attempt: any) => any;
    /**
     * Kiro only: the portal can pivot an organization login to the IdC device
     * flow (`login_option=awsidc`, issue #167); a true return settles the paste
     * through that device attempt instead of a code exchange.
     */
    resume?: (ctl: AuthController, code: any, claim: any) => boolean;
    /** Finalize the session right before it is saved (Devin resolves identity first). */
    finish?: (ctl: AuthController, session: any) => any;
    /** Awaited post-save catalog discovery, before the change notification. */
    discover?: (ctl: AuthController, session: any) => unknown;
    /** Fire-and-forget validation after the quota refresh starts (Antigravity). */
    probe?: (ctl: AuthController, saved: any) => unknown;
}
/** One family's row in the registry — references only, never implementations. */
export interface OAuthFamily {
    id: FamilyId;
    /** proxy-body: rewrite the inbound body before the hop (family cache.ts owns it). */
    applyCache: (payload: any, extra: {
        wire?: string;
    }) => FamilyCacheRewrite;
    /** QuotaStore: one account's quota read (family quota.ts owns endpoints/parsing). */
    fetchQuota: (session: any, fetchFn: any) => any;
    /** passthrough: Completions usage rewriting on forwarded answers, when this family maps any. */
    forward?: FamilyForwardHooks;
    /** login.ts: flow start, paste completion, and pasted keys (family accounts.ts owns them). */
    login: FamilyLoginHooks;
    /** account-quota: per-account hydration / refresh side effects, when this family has them. */
    quota?: FamilyQuotaHooks;
    /**
     * models.ts buildProviders/catalogProviders: this family's catalog rows,
     * referencing its own catalog.ts export (never a copy). Families without a
     * slot here project their static MODEL rows directly inside models.ts
     * (codex, grok, antigravity). GLM deliberately has no sync accessor: its
     * rows are read behind the glm session load (controller `#glmModels`) and
     * ride into familyCatalogInputs pre-resolved.
     */
    catalogModels?: () => readonly {
        id: string;
    }[];
}
/** The registry, keyed by family id (the ids of store.ts `PROVIDER_IDS`). */
export declare const OAUTH_FAMILIES: ReadonlyMap<string, OAuthFamily>;
/** Registry lookup; `undefined` means the id is not a known family. */
export declare function oauthFamily(id: string): OAuthFamily | undefined;
/**
 * The model-list bag src/oauth/models.ts projects: one `<family>Models` slot
 * per registry row that has a catalog accessor, keyed by buildProviders' /
 * catalogProviders' own parameter names. Every consumer spreads this same
 * bag (controller `#catalogInputs`, harness-sync's syncHarnessModels), so a
 * family row added to the registry can no longer be missed at one call site
 * — the review P1-2/P2-6 漏传 class, where one site omitted commandCodeModels
 * and only the static-catalog fallback inside models.ts hid it.
 *
 * GLM is the one async seat: the controller resolves its rows behind the glm
 * session load (`#glmModels`) and passes them in pre-resolved; they are never
 * read synchronously here. Left out, models.ts falls back to its static
 * GLM_MODELS — the behavior every syncHarnessModels caller without a session
 * (tests) already had.
 */
export declare function familyCatalogInputs({ glmModels }?: {
    glmModels?: readonly any[];
}): {
    glmModels?: readonly any[] | undefined;
};
