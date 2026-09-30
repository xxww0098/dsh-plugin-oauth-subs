/**
 * Login entry points behind the Settings RPC: browser / device / CLI flow
 * start, PKCE and Grok device completion, pasted keys, and local imports.
 * Family-specific completions live in each family's accounts.ts.
 */
import { describeError } from '../utils/http.js';
import { PROVIDER_IDS, publicSession, saveSession } from './store.js';
import { codexFlow, exchangeCodexCode } from './codex/index.js';
import { completeGrokDevice, exchangeGrokCode, grokDeviceSpec, grokFlow } from './grok/index.js';
import { glmSession, normalizeGlmRegion } from './glm/index.js';
import { exchangeKiroSocialCode } from './kiro/index.js';
import { antigravityFlow, exchangeAntigravityCode } from './antigravity/index.js';
import { importAntigravityAuth, importCodexAuth, importGlmAuth, importGrokAuth, importKiroAuth, } from './import-auth.js';
import { ollamaSession } from '../apikey/ollama/index.js';
import { commandCodeFlow, commandCodeSession } from '../apikey/command-code/index.js';
import { kimiDeviceSpec, kimiSession } from './kimi/index.js';
import { copilotDeviceSpec, mintCopilotSessionFromGithub } from './copilot/index.js';
import { devinFlow, devinSession, exchangeDevinCode } from './devin/index.js';
import { clineDeviceSpec } from './cline/index.js';
import { finishCommandCodeSession, importCommandCode } from '../apikey/command-code/accounts.js';
import { discoverOllama, finishOllamaSession, importOllama } from '../apikey/ollama/accounts.js';
import { probeAntigravity } from './antigravity/accounts.js';
import { discoverCline, importCline } from './cline/accounts.js';
import { discoverCopilot, finishCopilotSession, importCopilot } from './copilot/accounts.js';
import { discoverCursor, importCursor } from './cursor/accounts.js';
import { discoverDevin, finishDevinSession, importDevin } from './devin/accounts.js';
import { discoverKimi, finishKimiSession, importKimi } from './kimi/accounts.js';
import { discoverKiro, loginKiro, useKiroKey } from './kiro/accounts.js';
import { loginChatgpt } from './chatgpt/accounts.js';
export async function login(ctl, provider, options) {
    const payload = typeof options === 'string' || options == null ? { mode: options } : options;
    const mode = payload.mode ?? payload.region;
    if (provider === 'kiro')
        return loginKiro(ctl, payload);
    if (provider === 'chatgpt')
        return loginChatgpt(ctl, payload);
    if (provider === 'glm') {
        const region = normalizeGlmRegion(mode);
        const attempt = await ctl.glmFlows.start('glm', { region, fetchFn: ctl.fetchFn });
        ctl.finalizing.add('glm');
        void ctl.completeGlm(attempt);
        return { authorizeUrl: attempt.authorizeUrl, mode: 'cli', region };
    }
    if (provider === 'ollama') {
        throw new Error('ollama uses the paste form, not browser login');
    }
    if (provider === 'cursor') {
        const attempt = await ctl.cursorFlows.start('cursor', { fetchFn: ctl.fetchFn });
        ctl.finalizing.add('cursor');
        void ctl.completeCursor(attempt);
        return { authorizeUrl: attempt.authorizeUrl, mode: 'cli' };
    }
    if (provider === 'antigravity') {
        const attempt = await ctl.flows.start('antigravity', antigravityFlow);
        const claim = ctl.claim('antigravity');
        void ctl.completePkce('antigravity', attempt, claim);
        return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'oauth' };
    }
    if (provider === 'codex') {
        const attempt = await ctl.flows.start('codex', codexFlow);
        const claim = ctl.claim('codex');
        void ctl.completePkce('codex', attempt, claim);
        return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' };
    }
    if (provider === 'kimi') {
        const attempt = await ctl.devices.start('kimi', kimiDeviceSpec({ fetchFn: ctl.fetchFn }));
        ctl.finalizing.add('kimi');
        void ctl.completeKimiDevice(attempt);
        return {
            authorizeUrl: attempt.verificationUrl,
            verificationUri: attempt.verificationUri,
            userCode: attempt.userCode,
            mode: 'device',
        };
    }
    if (provider === 'copilot') {
        const attempt = await ctl.devices.start('copilot', copilotDeviceSpec({ fetchFn: ctl.fetchFn }));
        ctl.finalizing.add('copilot');
        void ctl.completeCopilotDevice(attempt);
        return {
            authorizeUrl: attempt.verificationUrl,
            verificationUri: attempt.verificationUri,
            userCode: attempt.userCode,
            mode: 'device',
        };
    }
    if (provider === 'devin') {
        const attempt = await ctl.flows.start('devin', devinFlow);
        const claim = ctl.claim('devin');
        void ctl.completePkce('devin', attempt, claim);
        return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' };
    }
    if (provider === 'cline') {
        const attempt = await ctl.devices.start('cline', clineDeviceSpec({ fetchFn: ctl.fetchFn }));
        ctl.finalizing.add('cline');
        void ctl.completeClineDevice(attempt);
        return {
            authorizeUrl: attempt.verificationUrl,
            verificationUri: attempt.verificationUri,
            userCode: attempt.userCode,
            mode: 'device',
        };
    }
    if (provider === 'command-code') {
        // Studio auth/cli redirects credentials straight to the loopback
        // callback — collect() resolves them, no code exchange exists.
        const attempt = await ctl.flows.start('command-code', commandCodeFlow);
        const claim = ctl.claim('command-code');
        void ctl.completeCommandCode(attempt, claim);
        return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'oauth' };
    }
    if (provider !== 'grok')
        throw new Error(`unknown provider ${provider}`);
    const useDevice = (mode ?? ctl.grokLogin) !== 'pkce';
    if (useDevice) {
        const attempt = await ctl.devices.start('grok', await grokDeviceSpec());
        ctl.finalizing.add('grok');
        void ctl.completeDevice('grok', attempt);
        return {
            authorizeUrl: attempt.verificationUrl,
            verificationUri: attempt.verificationUri,
            userCode: attempt.userCode,
            mode: 'device',
        };
    }
    const attempt = await ctl.flows.start('grok', await grokFlow());
    const claim = ctl.claim('grok');
    void ctl.completePkce('grok', attempt, claim);
    return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' };
}
export async function completePkce(ctl, provider, attempt, claim) {
    try {
        const code = await attempt.waitCode();
        // The Kiro portal redirected an organization login to the IdC device flow
        // (`login_option=awsidc`, issue #167): settle through the device attempt
        // the callback already started instead of exchanging a code.
        if (provider === 'kiro' && code && typeof code === 'object' && code.kiroIdcAttempt) {
            if (ctl.claims.get(provider) !== claim) {
                code.kiroIdcAttempt.cancel();
                return;
            }
            ctl.finalizing.add('kiro');
            void ctl.completeKiroIdc(code.kiroIdcAttempt);
            return;
        }
        const session = provider === 'codex'
            ? await exchangeCodexCode(code, attempt.pkce.verifier, attempt.redirectUri)
            : provider === 'kiro'
                ? await exchangeKiroSocialCode(code, attempt.pkce.verifier, attempt.redirectUri, {
                    fetchFn: ctl.fetchFn,
                    callback: typeof attempt.callback === 'function' ? attempt.callback() : attempt.callback,
                    machineId: attempt.machineId,
                })
                : provider === 'antigravity'
                    ? await exchangeAntigravityCode(code, attempt.redirectUri, { fetchFn: ctl.fetchFn })
                    : provider === 'devin'
                        ? await exchangeDevinCode(code, attempt.pkce.verifier, { fetchFn: ctl.fetchFn })
                        : await exchangeGrokCode(code, attempt.pkce.verifier, attempt.redirectUri, attempt.pkce.challenge);
        if (ctl.claims.get(provider) !== claim)
            return;
        const saved = await saveSession(provider, provider === 'devin' ? await finishDevinSession(ctl, session) : session, ctl.authPath);
        ctl.lastError.delete(provider);
        if (provider === 'kiro')
            await discoverKiro(ctl, session);
        if (provider === 'devin')
            await discoverDevin(ctl, session);
        ctl.onAuthChanged?.(provider);
        void ctl.quota.refresh(provider);
        if (provider === 'antigravity')
            void probeAntigravity(ctl, saved);
    }
    catch (error) {
        if (ctl.claims.get(provider) !== claim)
            return;
        if (!(error instanceof Error && error.message === 'login cancelled')) {
            ctl.lastError.set(provider, describeError(error));
        }
    }
}
export async function completeDevice(ctl, provider, attempt) {
    try {
        const tokens = await attempt.waitToken();
        const session = await completeGrokDevice(tokens);
        await saveSession(provider, session, ctl.authPath);
        ctl.lastError.delete(provider);
        ctl.onAuthChanged?.(provider);
        void ctl.quota.refresh(provider);
    }
    catch (error) {
        if (!(error instanceof Error && error.message === 'login cancelled')) {
            ctl.lastError.set(provider, describeError(error));
        }
    }
    finally {
        ctl.finalizing.delete(provider);
    }
}
export async function useKey(ctl, provider, key, extra) {
    const payload = typeof extra === 'string' || extra == null ? { region: extra } : extra;
    if (provider === 'kiro')
        return useKiroKey(ctl, key, payload);
    if (provider === 'ollama') {
        const session = await finishOllamaSession(ctl, ollamaSession({
            accessToken: key,
            source: 'paste',
        }));
        ctl.claim('ollama');
        await saveSession('ollama', session, ctl.authPath);
        ctl.lastError.delete('ollama');
        await discoverOllama(ctl, session);
        ctl.onAuthChanged?.('ollama');
        void ctl.quota.refresh('ollama');
        return { account: publicSession('ollama', session) };
    }
    if (provider === 'kimi') {
        const session = await finishKimiSession(ctl, kimiSession({
            accessToken: key,
            source: 'paste',
        }));
        ctl.claim('kimi');
        ctl.devices.pending('kimi')?.cancel();
        await saveSession('kimi', session, ctl.authPath);
        ctl.lastError.delete('kimi');
        await discoverKimi(ctl, session);
        ctl.onAuthChanged?.('kimi');
        void ctl.quota.refresh('kimi');
        return { account: publicSession('kimi', session) };
    }
    if (provider === 'copilot') {
        const session = await finishCopilotSession(ctl, await mintCopilotSessionFromGithub(key, {
            fetchFn: ctl.fetchFn,
            source: 'paste',
        }));
        ctl.claim('copilot');
        ctl.devices.pending('copilot')?.cancel();
        await saveSession('copilot', session, ctl.authPath);
        ctl.lastError.delete('copilot');
        await discoverCopilot(ctl, session);
        ctl.onAuthChanged?.('copilot');
        void ctl.quota.refresh('copilot');
        return { account: publicSession('copilot', session) };
    }
    if (provider === 'devin') {
        const session = await finishDevinSession(ctl, devinSession({
            accessToken: key,
            source: 'paste',
        }));
        ctl.claim('devin');
        ctl.flows.pending('devin')?.cancel();
        await saveSession('devin', session, ctl.authPath);
        ctl.lastError.delete('devin');
        await discoverDevin(ctl, session);
        ctl.onAuthChanged?.('devin');
        void ctl.quota.refresh('devin');
        return { account: publicSession('devin', session) };
    }
    if (provider === 'command-code') {
        const session = await finishCommandCodeSession(ctl, commandCodeSession({
            accessToken: key,
            source: 'paste',
        }));
        ctl.claim('command-code');
        ctl.flows.pending('command-code')?.cancel();
        await saveSession('command-code', session, ctl.authPath);
        ctl.lastError.delete('command-code');
        ctl.onAuthChanged?.('command-code');
        void ctl.quota.refresh('command-code');
        return { account: publicSession('command-code', session) };
    }
    if (provider !== 'glm')
        throw new Error('only GLM, Kiro, Ollama Cloud, Kimi, Copilot, Devin, and Command Code accept a pasted key');
    const accessToken = typeof key === 'string' ? key.trim() : '';
    if (accessToken.length < 8)
        throw new Error('glm API key is empty');
    ctl.claim('glm');
    ctl.glmFlows.pending('glm')?.cancel();
    const resolved = normalizeGlmRegion(payload.region ?? payload.mode);
    await saveSession('glm', glmSession({
        accessToken,
        account: 'api-key',
        region: resolved,
    }), ctl.authPath);
    ctl.lastError.delete('glm');
    ctl.onAuthChanged?.('glm');
    void ctl.quota.refresh('glm');
    return { region: resolved };
}
export async function importFrom(ctl, provider) {
    // A newer Settings page can name a family this host build does not know;
    // never fall through to Grok — that writes a foreign session under the
    // caller's provider key (observed: Grok tokens stored as `devin`).
    if (!PROVIDER_IDS.includes(provider))
        throw new Error(`unknown provider ${provider}`);
    // No local CLI store holds a Sign in with ChatGPT grant (its client id is per install).
    if (provider === 'chatgpt')
        throw new Error('Sign in with ChatGPT has no local session to import; use Continue with ChatGPT');
    const result = provider === 'codex'
        ? await importCodexAuth()
        : provider === 'glm'
            ? await importGlmAuth()
            : provider === 'kiro'
                ? await importKiroAuth()
                : provider === 'antigravity'
                    ? await importAntigravityAuth({ fetchFn: ctl.fetchFn })
                    : provider === 'cursor'
                        ? await importCursor(ctl)
                        : provider === 'ollama'
                            ? await importOllama(ctl)
                            : provider === 'kimi'
                                ? await importKimi(ctl)
                                : provider === 'copilot'
                                    ? await importCopilot(ctl)
                                    : provider === 'devin'
                                        ? await importDevin(ctl)
                                        : provider === 'cline'
                                            ? await importCline(ctl)
                                            : provider === 'command-code'
                                                ? await importCommandCode(ctl)
                                                : await importGrokAuth();
    ctl.claim(provider);
    ctl.flows.pending(provider)?.cancel();
    ctl.devices.pending(provider)?.cancel();
    ctl.glmFlows.pending(provider)?.cancel();
    ctl.kiroFlows.pending(provider)?.cancel();
    ctl.cursorFlows.pending(provider)?.cancel();
    const sessions = provider === 'kiro' && Array.isArray(result.sessions) && result.sessions.length > 0
        ? result.sessions
        : [result.session];
    for (let i = 0; i < sessions.length; i++) {
        await saveSession(provider, sessions[i], ctl.authPath, { activate: i === 0 });
    }
    ctl.lastError.delete(provider);
    if (provider === 'cursor')
        await discoverCursor(ctl, sessions[0]);
    if (provider === 'ollama')
        await discoverOllama(ctl, sessions[0]);
    if (provider === 'kiro')
        await discoverKiro(ctl, sessions[0]);
    if (provider === 'kimi')
        await discoverKimi(ctl, sessions[0]);
    if (provider === 'copilot')
        await discoverCopilot(ctl, sessions[0]);
    if (provider === 'devin')
        await discoverDevin(ctl, sessions[0]);
    if (provider === 'cline')
        await discoverCline(ctl, sessions[0]);
    ctl.onAuthChanged?.(provider);
    void ctl.quota.refresh(provider);
    return {
        source: result.source,
        account: publicSession(provider, sessions[0]),
        count: sessions.length,
    };
}
