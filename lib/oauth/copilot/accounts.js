/**
 * Copilot account lifecycle for AuthController: live catalog discovery, hosts.json
 * auto-import, session minting from the GitHub token, identity, and device-code
 * completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import { errorCode, errorMessage } from '../../utils/http.js';
import { accountIdOf, listStoredSessions, replaceAccountId, saveSession, updateAccountSession, } from '../store.js';
import { completeCopilotDevice as sessionFromCopilotDevice, isCopilotOpaqueAccount, isCopilotSessionToken, mintCopilotSessionFromGithub, resolveCopilotIdentity, } from './index.js';
import { COPILOT_IMPORT_EMPTY, importCopilotAuth } from './import.js';
import { copilotCatalogModels } from './catalog.js';
import { signedOutOf } from '../account-marks.js';
export async function discoverCopilot(ctl, session) {
    if (!session || typeof ctl.copilotDiscover !== 'function')
        return copilotCatalogModels();
    try {
        return await ctl.copilotDiscover(session, { fetchFn: ctl.fetchFn });
    }
    catch {
        return copilotCatalogModels();
    }
}
export async function maybeAutoImportCopilot(ctl) {
    if (!ctl.copilotAutoImport || ctl.copilotAutoImportTried)
        return;
    ctl.copilotAutoImportTried = true;
    if (await signedOutOf(ctl, 'copilot'))
        return;
    const rows = await listStoredSessions('copilot', ctl.authPath);
    if (rows.length > 0)
        return;
    try {
        const result = await importCopilotAuth({ env: process.env, allowEnv: false, fetchFn: ctl.fetchFn });
        if (result?.session) {
            const session = await finishCopilotSession(ctl, result.session);
            await saveSession('copilot', session, ctl.authPath);
            await discoverCopilot(ctl, session);
            ctl.onAuthChanged?.('copilot');
            void ctl.quota.refresh('copilot');
        }
    }
    catch (error) {
        if (errorCode(error) !== COPILOT_IMPORT_EMPTY && errorMessage(error) !== COPILOT_IMPORT_EMPTY) {
            // empty hosts.json is fine
        }
    }
}
export async function importCopilot(ctl) {
    const existing = await listStoredSessions('copilot', ctl.authPath);
    const result = await importCopilotAuth({ env: process.env, fetchFn: ctl.fetchFn });
    const incomingId = accountIdOf('copilot', result.session);
    const hit = existing.find((row) => row.id === incomingId);
    if (hit) {
        return { source: hit.session.source, session: hit.session, skipped: true };
    }
    return { ...result, session: await finishCopilotSession(ctl, result.session) };
}
export async function finishCopilotSession(ctl, session) {
    let next = session;
    if (!session?.accessToken || !isCopilotSessionToken(session.accessToken)) {
        if (session?.githubToken || session?.accessToken) {
            next = await mintCopilotSessionFromGithub(session.githubToken || session.accessToken, {
                fetchFn: ctl.fetchFn,
                source: session.source,
                account: session.account,
            });
            if (session.planType)
                next = { ...next, planType: session.planType };
        }
    }
    const identity = await resolveCopilotIdentity(next, { fetchFn: ctl.fetchFn });
    if (!identity)
        return next;
    if (identity.account)
        next = { ...next, account: identity.account };
    return next;
}
export async function rememberCopilotIdentity(ctl, row, quota) {
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
    const nextId = accountIdOf('copilot', next);
    if (nextId !== row.id && isCopilotOpaqueAccount(row.id)) {
        const saved = await replaceAccountId('copilot', row, next, ctl.authPath);
        if (!saved)
            return;
        ctl.quota.clear('copilot', row.id);
        await ctl.quota.ensure('copilot', saved.id, saved.session);
        return;
    }
    await updateAccountSession('copilot', row, next, ctl.authPath);
}
export async function completeCopilotDevice(ctl, attempt) {
    try {
        const tokens = await attempt.waitToken();
        const session = await finishCopilotSession(ctl, await sessionFromCopilotDevice(tokens, { fetchFn: ctl.fetchFn }));
        await saveSession('copilot', session, ctl.authPath);
        ctl.lastError.delete('copilot');
        await discoverCopilot(ctl, session);
        ctl.onAuthChanged?.('copilot');
        void ctl.quota.refresh('copilot');
    }
    catch (error) {
        if (!(error instanceof Error && error.message === 'login cancelled')) {
            ctl.lastError.set('copilot', error instanceof Error ? error.message : String(error));
        }
    }
    finally {
        ctl.finalizing.delete('copilot');
    }
}
