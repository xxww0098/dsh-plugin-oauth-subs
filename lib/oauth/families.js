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
import { codexRoutingHint } from './codex/index.js';
import { applyCodexCache } from './codex/cache.js';
import { normalizeCodexResponsesBody } from './codex/request.js';
import { fetchCodexQuota } from './codex/quota.js';
import { applyGrokCache } from './grok/cache.js';
import { normalizeGrokResponsesBody } from './grok/request.js';
import { fetchGrokQuota } from './grok/quota.js';
import { applyChatgptCache } from './chatgpt/cache.js';
import { normalizeChatgptResponsesBody } from './chatgpt/request.js';
import { chatgptQuota } from './chatgpt/index.js';
import { chatgptCatalogModels } from './chatgpt/catalog.js';
import { discoverChatgpt } from './chatgpt/accounts.js';
import { glmCacheSessionId } from './glm/cache.js';
import { normalizeGlmAnthropicBody, normalizeGlmChatBody } from './glm/request.js';
import { fetchGlmQuota } from './glm/quota.js';
import { kiroConversationId } from './kiro/cache.js';
import { fetchKiroQuota } from './kiro/quota.js';
import { kiroCatalogModels, resetKiroCatalogCache } from './kiro/catalog.js';
import { discoverKiro, rememberKiroProfile } from './kiro/accounts.js';
import { antigravitySessionIdOf } from './antigravity/cache.js';
import { fetchAntigravityQuota } from './antigravity/quota.js';
import { probeAntigravity, rememberAntigravityPlan } from './antigravity/accounts.js';
import { applyCursorCache } from './cursor/cache.js';
import { fetchCursorQuota } from './cursor/quota.js';
import { cursorCatalogModels } from './cursor/catalog.js';
import { discoverCursor, rememberCursorPlan } from './cursor/accounts.js';
import { applyOllamaCache } from '../apikey/ollama/cache.js';
import { fetchOllamaQuota } from '../apikey/ollama/quota.js';
import { ollamaCatalogModels } from '../apikey/ollama/catalog.js';
import { discoverOllama, rememberOllamaIdentity } from '../apikey/ollama/accounts.js';
import { applyKimiCache } from './kimi/cache.js';
import { applyKimiStreamUsage, applyKimiThinking } from './kimi/request.js';
import { fetchKimiQuota } from './kimi/quota.js';
import { kimiCatalogModels } from './kimi/catalog.js';
import { discoverKimi, rememberKimiIdentity } from './kimi/accounts.js';
import { applyCopilotCache, copilotHasVision, copilotInitiatorOf } from './copilot/cache.js';
import { applyCopilotStreamUsage, applyCopilotThinking } from './copilot/request.js';
import { fetchCopilotQuota } from './copilot/quota.js';
import { copilotCatalogModels } from './copilot/catalog.js';
import { discoverCopilot, rememberCopilotIdentity } from './copilot/accounts.js';
import { applyDevinCache } from './devin/cache.js';
import { fetchDevinQuota } from './devin/quota.js';
import { devinCatalogModels } from './devin/catalog.js';
import { discoverDevin, rememberDevinIdentity } from './devin/accounts.js';
import { applyClineCache } from './cline/cache.js';
import { applyClineMaxCompletionTokens, applyClineStreamUsage, applyClineThinking } from './cline/request.js';
import { fetchClineQuota } from './cline/quota.js';
import { clineCatalogModels } from './cline/catalog.js';
import { discoverCline, rememberClineIdentity } from './cline/accounts.js';
import { applyCommandCodeCache } from '../apikey/command-code/cache.js';
import { fetchCommandCodeQuota } from '../apikey/command-code/quota.js';
import { rememberCommandCodeIdentity } from '../apikey/command-code/accounts.js';
import { applyFastMode } from '../utils/fast-mode.js';
const codexFamily = {
    id: 'codex',
    applyCache(payload) {
        // Codex Fast is Codex Priority: peel `-fast` into service_tier + routing hint.
        const { payload: next, cacheSessionId } = applyCodexCache(normalizeCodexResponsesBody(applyFastMode(payload)));
        return {
            payload: next,
            cacheSessionId,
            routingHint: codexRoutingHint(typeof next.model === 'string' ? next.model : '', next.service_tier),
        };
    },
    fetchQuota: fetchCodexQuota,
};
const chatgptFamily = {
    id: 'chatgpt',
    applyCache(payload) {
        // No Fast rows on this route: a stray `-fast` id is not peeled into a
        // service tier (normalize drops service_tier; the public API has no Priority hint).
        const { payload: next, cacheSessionId } = applyChatgptCache(normalizeChatgptResponsesBody(payload));
        return { payload: next, cacheSessionId };
    },
    // No quota endpoint: the plan is read off the session's own token claims.
    fetchQuota: (session) => chatgptQuota(session),
    quota: {
        discover: {
            models: chatgptCatalogModels,
            run: discoverChatgpt,
        },
    },
};
const grokFamily = {
    id: 'grok',
    applyCache(payload) {
        // Grok Fast is a real backend model id (`grok-4.7-build-fast`), not Codex
        // Priority: the shared peel would rewrite it to a nonexistent model.
        // normalizeGrokResponsesBody owns model hygiene + service_tier here.
        const { payload: next, cacheSessionId } = applyGrokCache(normalizeGrokResponsesBody(payload));
        return {
            payload: next,
            cacheSessionId,
            grokModel: typeof next.model === 'string' ? next.model : undefined,
        };
    },
    fetchQuota: fetchGrokQuota,
};
const glmFamily = {
    id: 'glm',
    applyCache(payload, { wire }) {
        const fast = applyFastMode(payload);
        const next = wire === 'anthropic' ? normalizeGlmAnthropicBody(fast) : normalizeGlmChatBody(fast);
        return {
            payload: next,
            cacheSessionId: glmCacheSessionId(next.user)
                || glmCacheSessionId(next.metadata?.user_id)
                || glmCacheSessionId(next.session_id),
        };
    },
    fetchQuota: fetchGlmQuota,
};
const kiroFamily = {
    id: 'kiro',
    applyCache(payload) {
        const next = { ...applyFastMode(payload) };
        delete next.prompt_cache_retention;
        delete next.prompt_cache_options;
        return { payload: next, cacheSessionId: kiroConversationId(next) };
    },
    fetchQuota: fetchKiroQuota,
    quota: {
        afterEnsure: rememberKiroProfile,
        discover: {
            models: kiroCatalogModels,
            // A manual refresh re-asks: the list follows the egress region, and a
            // system VPN change is invisible to the token + proxy cache key.
            reset: resetKiroCatalogCache,
            run: discoverKiro,
        },
    },
};
const antigravityFamily = {
    id: 'antigravity',
    applyCache(payload) {
        const next = { ...applyFastMode(payload) };
        delete next.prompt_cache_retention;
        delete next.prompt_cache_options;
        return { payload: next, cacheSessionId: antigravitySessionIdOf(next) };
    },
    fetchQuota: fetchAntigravityQuota,
    quota: {
        afterEnsure: rememberAntigravityPlan,
        probe: probeAntigravity,
    },
};
const cursorFamily = {
    id: 'cursor',
    applyCache(payload) {
        // Cursor Fast is RequestedModel `{ id: 'fast' }`, not Codex Priority.
        // Keep the picker `-fast` suffix for openaiToCursor; do not peel here.
        const { payload: next, cacheSessionId } = applyCursorCache(payload);
        return { payload: next, cacheSessionId };
    },
    fetchQuota: fetchCursorQuota,
    quota: {
        afterEnsure: rememberCursorPlan,
        remember: rememberCursorPlan,
        discover: {
            models: cursorCatalogModels,
            run: discoverCursor,
        },
    },
};
const ollamaFamily = {
    id: 'ollama',
    applyCache(payload) {
        const { payload: next, cacheSessionId } = applyOllamaCache(applyFastMode(payload));
        return { payload: next, cacheSessionId };
    },
    fetchQuota: fetchOllamaQuota,
    quota: {
        afterEnsure: rememberOllamaIdentity,
        remember: rememberOllamaIdentity,
        discover: {
            models: ollamaCatalogModels,
            run: discoverOllama,
        },
        relistAccountsAfterRefresh: true,
    },
};
const kimiFamily = {
    id: 'kimi',
    applyCache(payload) {
        const { payload: cached, cacheSessionId } = applyKimiCache(applyFastMode(payload));
        return { payload: applyKimiStreamUsage(applyKimiThinking(cached)), cacheSessionId };
    },
    fetchQuota: fetchKimiQuota,
    quota: {
        afterEnsure: rememberKimiIdentity,
        remember: rememberKimiIdentity,
        discover: {
            models: kimiCatalogModels,
            run: discoverKimi,
        },
        relistAccountsAfterRefresh: true,
    },
};
const copilotFamily = {
    id: 'copilot',
    applyCache(payload) {
        const { payload: cached, cacheSessionId } = applyCopilotCache(applyFastMode(payload));
        const next = applyCopilotStreamUsage(applyCopilotThinking(cached));
        return {
            payload: next,
            cacheSessionId,
            copilotVision: copilotHasVision(next.messages),
            copilotInitiator: copilotInitiatorOf(next.messages),
        };
    },
    fetchQuota: fetchCopilotQuota,
    quota: {
        // No afterEnsure hook: identity write-back rides the manual refresh only.
        remember: rememberCopilotIdentity,
        discover: {
            models: copilotCatalogModels,
            run: discoverCopilot,
        },
        relistAccountsAfterRefresh: true,
    },
};
const devinFamily = {
    id: 'devin',
    applyCache(payload) {
        // Devin `-fast` is a real backend variant uid, not Codex Priority — the
        // picker id must reach openaiToDevin unpeeled, same as Cursor.
        const { payload: next, cacheSessionId } = applyDevinCache(payload);
        return { payload: next, cacheSessionId };
    },
    fetchQuota: fetchDevinQuota,
    quota: {
        afterEnsure: rememberDevinIdentity,
        remember: rememberDevinIdentity,
        discover: {
            models: devinCatalogModels,
            run: discoverDevin,
        },
        relistAccountsAfterRefresh: true,
    },
};
const clineFamily = {
    id: 'cline',
    applyCache(payload) {
        // OpenRouter-backed Completions: cache affinity rides the X-Task-ID
        // header (clineCacheHeaders), not a body field. The body edits are the
        // CLI's own three (max_completion_tokens rename, include_usage,
        // reasoning_effort passthrough) and nothing else.
        const { payload: cached, cacheSessionId } = applyClineCache(applyFastMode(payload));
        const next = applyClineStreamUsage(applyClineThinking(applyClineMaxCompletionTokens(cached)));
        return { payload: next, cacheSessionId };
    },
    fetchQuota: fetchClineQuota,
    quota: {
        afterEnsure: rememberClineIdentity,
        remember: rememberClineIdentity,
        discover: {
            models: clineCatalogModels,
            run: discoverCline,
        },
        relistAccountsAfterRefresh: true,
    },
};
const commandCodeFamily = {
    id: 'command-code',
    applyCache(payload) {
        // threadId is the wire's top-level cache-affinity uuid (see cache.ts);
        // foreign DSH fields are stripped before openaiToCommandCode maps the
        // body onto /alpha/generate's JSONL protocol.
        const { payload: next, threadId } = applyCommandCodeCache(applyFastMode(payload));
        return { payload: next, cacheSessionId: threadId, threadId };
    },
    fetchQuota: fetchCommandCodeQuota,
    quota: {
        afterEnsure: rememberCommandCodeIdentity,
        // whoami rides the quota chain and promotes the opaque vault id.
        remember: rememberCommandCodeIdentity,
        relistAccountsAfterRefresh: true,
    },
};
const FAMILIES = [
    codexFamily, chatgptFamily, grokFamily, glmFamily, kiroFamily, antigravityFamily,
    cursorFamily, ollamaFamily, kimiFamily, copilotFamily, devinFamily, clineFamily,
    commandCodeFamily,
];
/** The registry, keyed by family id (the ids of store.ts `PROVIDER_IDS`). */
export const OAUTH_FAMILIES = new Map(FAMILIES.map((family) => [family.id, family]));
/** Registry lookup; `undefined` means the id is not a known family. */
export function oauthFamily(id) {
    return OAUTH_FAMILIES.get(id);
}
