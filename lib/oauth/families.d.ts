/**
 * Family registry: the one table keyed by family id that the central
 * per-family dispatchers look up instead of growing `family === '<id>'`
 * chains — today the inbound cache rewrite (proxy-body.ts), the quota
 * fetch (quota.ts QuotaStore) and the account-quota hydration hooks
 * (account-quota.ts).
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
/** One family's row in the registry — references only, never implementations. */
export interface OAuthFamily {
    id: FamilyId;
    /** proxy-body: rewrite the inbound body before the hop (family cache.ts owns it). */
    applyCache: (payload: any, extra: {
        wire?: string;
    }) => FamilyCacheRewrite;
    /** QuotaStore: one account's quota read (family quota.ts owns endpoints/parsing). */
    fetchQuota: (session: any, fetchFn: any) => any;
    /** account-quota: per-account hydration / refresh side effects, when this family has them. */
    quota?: FamilyQuotaHooks;
}
/** The registry, keyed by family id (the ids of store.ts `PROVIDER_IDS`). */
export declare const OAUTH_FAMILIES: ReadonlyMap<string, OAuthFamily>;
/** Registry lookup; `undefined` means the id is not a known family. */
export declare function oauthFamily(id: string): OAuthFamily | undefined;
