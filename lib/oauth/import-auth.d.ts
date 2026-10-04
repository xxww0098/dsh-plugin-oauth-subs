/**
 * Shared, vendor-agnostic helpers for the per-family local-session importers
 * (probe-read JSON, token-expiry normalisation, Hermes multi-provider store
 * parsing). Every family-specific importer lives in its family folder
 * (`src/oauth/<id>/import.ts`); this file re-exports those entry points as a
 * compatibility barrel so existing `from './import-auth.js'` callers keep
 * working. The barrel is scheduled to shrink as callers migrate to the family
 * paths — no importer logic stays here.
 */
export { importCodexAuth, codexImported } from './codex/import.js';
export { GROK_HERMES_KEYS, grokAuthSearchPaths, tokensFromGrokCli, importGrokAuth, } from './grok/import.js';
export { glmZcodeDisabledReason, glmKeyCandidateFromZcodeConfig, glmKeyFromZcodeConfig, decodeZcodeCredentialValue, glmKeyFromZcodeCredentials, glmAuthSearchPaths, importGlmAuth, } from './glm/import.js';
export { antigravityAuthSearchPaths, importAntigravityAuth } from './antigravity/import.js';
export { kiroAuthSearchPaths, sessionFromKiroAuth, importKiroAuth } from './kiro/import.js';
export declare function homeFile(...parts: any[]): string;
export declare function readJson(path: any): Promise<any>;
export declare function asPositiveNumber(value: any): number | undefined;
export declare function parseTime(value: any): number | undefined;
export declare function pickString(...values: any[]): string | undefined;
export declare function tokensFromHermes(raw: any, keys: any): {
    access_token: string;
    refresh_token: string | undefined;
    id_token: string | undefined;
    expires_in: any;
    expires_at: any;
    last_refresh: string | undefined;
    token_endpoint: string | undefined;
    account: string | undefined;
} | undefined;
export declare function withExpiry(tokens: any, lastRefresh: any): any;
