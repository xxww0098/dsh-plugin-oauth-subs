/**
 * Ollama Cloud account lifecycle for AuthController: live catalog discovery, OLLAMA_API_KEY
 * auto-import, and identity from /api/me.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import { errorCode, errorMessage } from '../../utils/http.js';
import { accountIdOf, listStoredSessions, replaceAccountId, saveSession, updateAccountSession, } from '../../oauth/store.js';
import { isOllamaOpaqueAccount, resolveOllamaIdentity } from './index.js';
import { importOllamaAuth, OLLAMA_IMPORT_EMPTY } from './import.js';
import { ollamaCatalogModels } from './catalog.js';
import { signedOutOf } from '../../oauth/account-marks.js';
export async function discoverOllama(ctl, session) {
    if (!session || typeof ctl.ollamaDiscover !== 'function')
        return ollamaCatalogModels();
    try {
        return await ctl.ollamaDiscover(session, { fetchFn: ctl.fetchFn });
    }
    catch {
        return ollamaCatalogModels();
    }
}
export async function maybeAutoImportOllama(ctl) {
    if (!ctl.ollamaAutoImport || ctl.ollamaAutoImportTried)
        return;
    ctl.ollamaAutoImportTried = true;
    if (await signedOutOf(ctl, 'ollama'))
        return;
    const rows = await listStoredSessions('ollama', ctl.authPath);
    if (rows.length > 0)
        return;
    try {
        const result = await importOllamaAuth({ env: process.env });
        if (result?.session) {
            const session = await finishOllamaSession(ctl, result.session);
            await saveSession('ollama', session, ctl.authPath);
            await discoverOllama(ctl, session);
            ctl.onAuthChanged?.('ollama');
            void ctl.quota.refresh('ollama');
        }
    }
    catch (error) {
        if (errorCode(error) !== OLLAMA_IMPORT_EMPTY && errorMessage(error) !== OLLAMA_IMPORT_EMPTY) {
            // empty env is fine; other faults stay off the Settings banner
        }
    }
}
export async function importOllama(ctl) {
    const existing = await listStoredSessions('ollama', ctl.authPath);
    const result = await importOllamaAuth({ env: process.env });
    const incomingId = accountIdOf('ollama', result.session);
    const hit = existing.find((row) => row.id === incomingId);
    if (hit) {
        return { source: hit.session.source, session: hit.session, skipped: true };
    }
    return { ...result, session: await finishOllamaSession(ctl, result.session) };
}
export async function finishOllamaSession(ctl, session) {
    const identity = await resolveOllamaIdentity(session, { fetchFn: ctl.fetchFn });
    if (!identity)
        return session;
    const next = { ...session };
    if (identity.account)
        next.account = identity.account;
    if (identity.planType)
        next.planType = identity.planType;
    return next;
}
export async function rememberOllamaIdentity(ctl, row, quota) {
    if (!quota || quota.status !== 'ready')
        return;
    const account = typeof quota.account === 'string' && quota.account.trim() ? quota.account.trim() : undefined;
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined;
    if (!account && !planType)
        return;
    if ((!account || row.session.account === account)
        && (!planType || row.session.planType === planType))
        return;
    const next = { ...row.session };
    if (account)
        next.account = account;
    if (planType)
        next.planType = planType;
    const nextId = accountIdOf('ollama', next);
    if (nextId !== row.id && isOllamaOpaqueAccount(row.id)) {
        const saved = await replaceAccountId('ollama', row, next, ctl.authPath);
        if (!saved)
            return;
        ctl.quota.clear('ollama', row.id);
        await ctl.quota.ensure('ollama', saved.id, saved.session);
        return;
    }
    await updateAccountSession('ollama', row, next, ctl.authPath);
}
