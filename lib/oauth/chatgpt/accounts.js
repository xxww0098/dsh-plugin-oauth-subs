/**
 * Sign in with ChatGPT account lifecycle for AuthController: start (register or
 * reauthorize), callback completion, sign-out with revocation, and live
 * catalog discovery. Functions take the controller as their first argument.
 */
import { createHash } from 'node:crypto';
import { describeError } from '../../utils/http.js';
import { listStoredSessions, saveSession } from '../store.js';
import { chatgptCallbackClientId, chatgptFlow, chatgptPlanUseGranted, chatgptSession, redeemChatgptCode, revokeChatgpt, } from './index.js';
import { chatgptCatalogModels } from './catalog.js';
import { chatgptRegistration, chatgptRegistrations, ensureChatgptHostId, rememberChatgptRegistration } from './host.js';
/** Vault key: email for people, plus a short client hash so two workspaces on one email stay apart. */
export function chatgptAccountKey(email, clientId) {
    const tag = createHash('sha256').update(String(clientId)).digest('hex').slice(0, 8);
    return email ? `${email}#${tag}` : `chatgpt-${tag}`;
}
export async function discoverChatgpt(ctl, session) {
    if (!session || typeof ctl.chatgptDiscover !== 'function')
        return chatgptCatalogModels();
    try {
        return await ctl.chatgptDiscover(session, { fetchFn: ctl.fetchFn });
    }
    catch {
        return chatgptCatalogModels();
    }
}
/**
 * `payload.account` (a vault id) reconnects that registration: its issued
 * client id, the stored ID token as `id_token_hint` and email as
 * `login_hint`. Anything else registers a new client with
 * `dynamic_agent_client` unless a signed-out registration can be reused.
 * `payload.mode === 'consent'` re-asks for plan use.
 */
export async function loginChatgpt(ctl, payload = {}) {
    const hostId = await ensureChatgptHostId(ctl.authPath);
    const rows = await listStoredSessions('chatgpt', ctl.authPath);
    const row = typeof payload.account === 'string' ? rows.find((entry) => entry.id === payload.account) : undefined;
    let registration = row?.session?.clientId ? await chatgptRegistration(ctl.authPath, row.session.clientId) : undefined;
    if (!registration && typeof payload.clientId === 'string') {
        registration = await chatgptRegistration(ctl.authPath, payload.clientId);
    }
    // A registration with no stored login (signed out, or its refresh token
    // died) is reauthorized instead of registering another client. `mode: 'new'`
    // forces a fresh registration (another account or workspace).
    if (!registration && payload.mode !== 'new') {
        const live = new Set(rows.map((entry) => entry.session?.clientId));
        const orphans = (await chatgptRegistrations(ctl.authPath)).filter((entry) => !live.has(entry.clientId));
        registration = orphans[orphans.length - 1];
    }
    const spec = chatgptFlow({
        hostId,
        clientId: registration?.clientId,
        idTokenHint: row?.session?.idToken,
        loginHint: row?.session?.emailAddress ?? registration?.email,
        forceConsent: payload.mode === 'consent',
    });
    const attempt = await ctl.flows.start('chatgpt', spec);
    attempt.chatgpt = { spec, hostId, expectedSubject: registration?.subject };
    const claim = ctl.claim('chatgpt');
    void completeChatgpt(ctl, attempt, claim);
    return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce', registering: spec.registering };
}
export async function completeChatgpt(ctl, attempt, claim) {
    const { spec, hostId, expectedSubject } = attempt.chatgpt;
    try {
        const result = await attempt.waitCode();
        const clientId = chatgptCallbackClientId(result, spec);
        const { tokens, identity } = await redeemChatgptCode({
            code: result.code,
            verifier: attempt.pkce.verifier,
            redirectUri: attempt.redirectUri,
            clientId,
            nonce: spec.nonce,
            expectedSubject,
            fetchFn: ctl.fetchFn,
        });
        if (ctl.claims.get('chatgpt') !== claim)
            return;
        const email = typeof identity.email === 'string' && identity.email.trim() ? identity.email.trim() : undefined;
        const accountKey = chatgptAccountKey(email, clientId);
        // The registration outlives this grant: a later sign-in reauthorizes it.
        await rememberChatgptRegistration(ctl.authPath, { clientId, subject: identity.sub, email, accountKey });
        if (!chatgptPlanUseGranted(tokens)) {
            throw new Error('ChatGPT sign-in succeeded, but "Use your ChatGPT plan" was not allowed. Sign in again and allow it to use this family.');
        }
        const session = { ...chatgptSession(tokens, { clientId, hostId, subject: identity.sub }), accountKey };
        await saveSession('chatgpt', session, ctl.authPath);
        ctl.lastError.delete('chatgpt');
        await discoverChatgpt(ctl, session);
        ctl.onAuthChanged?.('chatgpt');
        void ctl.quota.refresh('chatgpt');
    }
    catch (error) {
        if (ctl.claims.get('chatgpt') !== claim)
            return;
        if (!(error instanceof Error && error.message === 'login cancelled')) {
            ctl.lastError.set('chatgpt', describeError(error));
        }
    }
}
/**
 * Revoke the renewable session before local sign-out; an unconfirmed
 * revocation still signs out and says so. The registration is kept.
 */
export async function revokeChatgptAccounts(ctl, id) {
    const rows = await listStoredSessions('chatgpt', ctl.authPath);
    const targets = id ? rows.filter((row) => row.id === id) : rows.filter((row) => row.active);
    const results = await Promise.all(targets.map((row) => revokeChatgpt(row.session, { fetchFn: ctl.fetchFn })));
    return results.every(Boolean);
}
export { chatgptRegistrations };
