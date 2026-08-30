/**
 * dsh-plugin-oauth-subs host half.
 *
 * A Cordis plugin (export apply + inject + Config) that:
 *   1. runs a loopback OpenAI Responses proxy on 127.0.0.1:<port>
 *   2. drives ChatGPT Codex PKCE and xAI Grok device-code / PKCE logins
 *   3. syncs logged-in catalogs into llm-pi-ai
 *
 * The client half (Settings > OAuth 订阅) is discovered from package.json
 * `dsh.client` — this module only owns the node process.
 */
import z from '@deepseek-ai/schemastery';
export declare const name = "dsh-plugin-oauth-subs";
export declare const inject: string[];
/** Schemastery Standard Schema — Cordis reads Config["~standard"].validate. */
export declare const Config: z<Schemastery.ObjectS<{
    port: z<number, number>;
    provider: z<string, string>;
    dataDir: z<string, string>;
    grokLogin: z<"pkce" | "device", "pkce" | "device">;
}>, Schemastery.ObjectT<{
    port: z<number, number>;
    provider: z<string, string>;
    dataDir: z<string, string>;
    grokLogin: z<"pkce" | "device", "pkce" | "device">;
}>>;
export declare function apply(ctx: any, config?: {}): void;
export { CODEX_CLIENT_ID, CODEX_AUTHORIZE_URL, CODEX_TOKEN_URL, CODEX_API_URL, CODEX_ORIGINATOR, CODEX_USER_AGENT, codexCredentialHeaders, } from './oauth/codex/index.js';
export { GROK_CLIENT_ID, GROK_DISCOVERY_URL, GROK_API_URL, GROK_USER_AGENT, GROK_CONTEXT_WINDOW, GROK_LARGE_CONTEXT, GROK_REASONING_45, GROK_REASONING_46, grokCredentialHeaders, } from './oauth/grok/index.js';
export { OAUTH_CREDENTIAL_REF, ModelSwitch } from './oauth/models.js';
export { defaultDataDir } from './oauth/store.js';
export { AuthController } from './oauth/controller.js';
export { applyFastMode, modelSupportsFastMode } from './utils/fast-mode.js';
export { CONTEXT_VARIANT_SUFFIX, codexLargeContext, applyContextMode, isCodex900kBase, peelContextSuffix, } from './utils/context-mode.js';
export { parseCodexUsage, parseGrokBilling, parseResetCredits, QuotaStore } from './oauth/quota.js';
export { formatPlanLabel, CODEX_PLAN_NAMES } from './oauth/plan.js';
