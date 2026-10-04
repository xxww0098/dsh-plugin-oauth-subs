/**
 * Per-family TokenManager wiring, extracted verbatim from controller.ts
 * (behavior-identical move): one factory builds the 13 manager instances the
 * controller assigns to `this.tokens`. Everything those literals used to
 * close over from the constructor arrives through `deps`; family refresh
 * hooks, import predicates, and preempt constants stay imports from their own
 * family modules (the preempt values are single-sourced from the family
 * index constants — glm, kiro, ollama, and command-code have no exported
 * constant yet, so their literals stay).
 */
import { TokenManager } from './tokens.js';
import { CODEX_PERMANENT_REFRESH_CODES, CODEX_PREEMPT_MS, refreshCodex } from './codex/index.js';
import { codexImported } from './import-auth.js';
import { CHATGPT_PERMANENT_REFRESH_CODES, CHATGPT_PREEMPT_MS, refreshChatgpt } from './chatgpt/index.js';
import { GROK_PREEMPT_MS, refreshGrok } from './grok/index.js';
import { refreshGlm } from './glm/index.js';
import { refreshKiro } from './kiro/index.js';
import { ANTIGRAVITY_PREEMPT_MS, refreshAntigravity } from './antigravity/index.js';
import { CURSOR_PREEMPT_MS, refreshCursor } from './cursor/index.js';
import { cursorImported } from './cursor/import.js';
import { refreshOllama } from '../apikey/ollama/index.js';
import { KIMI_PREEMPT_MS, refreshKimi } from './kimi/index.js';
import { kimiImported } from './kimi/import.js';
import { COPILOT_PREEMPT_MS, refreshCopilot } from './copilot/index.js';
import { DEVIN_PREEMPT_MS, refreshDevin } from './devin/index.js';
import { devinUserStatus } from './devin/transport.js';
import { CLINE_PREEMPT_MS, refreshCline } from './cline/index.js';
import { clineImported } from './cline/import.js';
import { refreshCommandCode } from '../apikey/command-code/index.js';
export function buildTokenManagers(deps) {
    const { authPath, fetchFn, cursorImport, onAuthChanged } = deps;
    return {
        codex: new TokenManager({
            displayName: 'ChatGPT (Codex)',
            preemptMs: CODEX_PREEMPT_MS,
            provider: 'codex',
            authPath,
            refresh: (session) => refreshCodex(session, fetchFn),
            permanentCodes: CODEX_PERMANENT_REFRESH_CODES,
            imported: codexImported,
            onRemoved: () => onAuthChanged?.('codex'),
        }),
        chatgpt: new TokenManager({
            displayName: 'ChatGPT (Sign in with ChatGPT)',
            preemptMs: CHATGPT_PREEMPT_MS,
            provider: 'chatgpt',
            authPath,
            refresh: (session) => refreshChatgpt(session, fetchFn),
            permanentCodes: CHATGPT_PERMANENT_REFRESH_CODES,
            onRemoved: () => onAuthChanged?.('chatgpt'),
        }),
        grok: new TokenManager({
            displayName: 'Grok (Subscription)',
            preemptMs: GROK_PREEMPT_MS,
            provider: 'grok',
            authPath,
            refresh: (session) => refreshGrok(session, fetchFn),
            onRemoved: () => onAuthChanged?.('grok'),
        }),
        glm: new TokenManager({
            displayName: 'GLM (Coding Plan)',
            preemptMs: 24 * 60 * 60_000,
            provider: 'glm',
            authPath,
            refresh: refreshGlm,
            onRemoved: () => onAuthChanged?.('glm'),
        }),
        kiro: new TokenManager({
            displayName: 'Kiro',
            preemptMs: 2 * 60_000,
            provider: 'kiro',
            authPath,
            refresh: (session) => refreshKiro(session, { fetchFn }),
            onRemoved: () => onAuthChanged?.('kiro'),
        }),
        antigravity: new TokenManager({
            displayName: 'Antigravity',
            preemptMs: ANTIGRAVITY_PREEMPT_MS,
            provider: 'antigravity',
            authPath,
            refresh: (session) => refreshAntigravity(session, fetchFn),
            onRemoved: () => onAuthChanged?.('antigravity'),
        }),
        cursor: new TokenManager({
            displayName: 'Cursor',
            preemptMs: CURSOR_PREEMPT_MS,
            provider: 'cursor',
            authPath,
            refresh: (session) => refreshCursor(session, fetchFn),
            imported: cursorImported(cursorImport),
            onRemoved: () => onAuthChanged?.('cursor'),
        }),
        ollama: new TokenManager({
            displayName: 'Ollama Cloud',
            preemptMs: 24 * 60 * 60_000,
            provider: 'ollama',
            authPath,
            refresh: refreshOllama,
            onRemoved: () => onAuthChanged?.('ollama'),
        }),
        kimi: new TokenManager({
            displayName: 'Kimi (Code Plan)',
            preemptMs: KIMI_PREEMPT_MS,
            provider: 'kimi',
            authPath,
            refresh: (session) => refreshKimi(session, fetchFn),
            imported: kimiImported,
            onRemoved: () => onAuthChanged?.('kimi'),
        }),
        copilot: new TokenManager({
            displayName: 'GitHub Copilot',
            preemptMs: COPILOT_PREEMPT_MS,
            provider: 'copilot',
            authPath,
            refresh: (session) => refreshCopilot(session, fetchFn),
            onRemoved: () => onAuthChanged?.('copilot'),
        }),
        devin: new TokenManager({
            displayName: 'Devin Agent',
            preemptMs: DEVIN_PREEMPT_MS,
            provider: 'devin',
            authPath,
            refresh: (session) => refreshDevin(session, { fetchFn, statusFn: devinUserStatus }),
            onRemoved: () => onAuthChanged?.('devin'),
        }),
        cline: new TokenManager({
            displayName: 'Cline',
            preemptMs: CLINE_PREEMPT_MS,
            provider: 'cline',
            authPath,
            refresh: (session) => refreshCline(session, fetchFn),
            imported: clineImported,
            onRemoved: () => onAuthChanged?.('cline'),
        }),
        'command-code': new TokenManager({
            displayName: 'Command Code',
            preemptMs: 24 * 60 * 60_000,
            provider: 'command-code',
            authPath,
            refresh: refreshCommandCode,
            onRemoved: () => onAuthChanged?.('command-code'),
        }),
    };
}
