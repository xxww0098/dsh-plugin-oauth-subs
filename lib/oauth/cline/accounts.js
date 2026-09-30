/**
 * Cline account lifecycle for AuthController: live catalog discovery, local CLI
 * auto-import, identity, and the two-hop device-code completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import { errorCode, errorMessage } from '../../utils/http.js';
import { accountIdOf, listStoredSessions, replaceAccountId, saveSession, updateAccountSession, } from '../store.js';
import { isClineOpaqueAccount, registerClineTokens, resolveClineIdentity } from './index.js';
import { clineCatalogModels } from './catalog.js';
import { CLINE_IMPORT_EMPTY, importClineAuth } from './import.js';
import { signedOutOf } from '../account-marks.js';
export async function discoverCline(ctl, session) {
    if (!session || typeof ctl.clineDiscover !== 'function')
        return clineCatalogModels();
    try {
        return await ctl.clineDiscover(session, { fetchFn: ctl.fetchFn });
    }
    catch {
        return clineCatalogModels();
    }
}
export async function maybeAutoImportCline(ctl) {
    if (!ctl.clineAutoImport || ctl.clineAutoImportTried)
        return;
    ctl.clineAutoImportTried = true;
    if (await signedOutOf(ctl, 'cline'))
        return;
    const rows = await listStoredSessions('cline', ctl.authPath);
    if (rows.length > 0)
        return;
    try {
        const result = await importClineAuth({ env: process.env });
        if (result?.session) {
            const session = await finishClineSession(ctl, result.session);
            await saveSession('cline', session, ctl.authPath);
            await discoverCline(ctl, session);
            ctl.onAuthChanged?.('cline');
            void ctl.quota.refresh('cline');
        }
    }
    catch (error) {
        if (errorCode(error) !== CLINE_IMPORT_EMPTY && errorMessage(error) !== CLINE_IMPORT_EMPTY) {
            // empty providers.json is fine
        }
    }
}
export async function importCline(ctl) {
    const existing = await listStoredSessions('cline', ctl.authPath);
    const result = await importClineAuth({ env: process.env });
    const incomingId = accountIdOf('cline', result.session);
    const hit = existing.find((row) => row.id === incomingId);
    if (hit) {
        return { source: hit.session.source, session: hit.session, skipped: true };
    }
    return { ...result, session: await finishClineSession(ctl, result.session) };
}
export async function finishClineSession(ctl, session) {
    const identity = await resolveClineIdentity(session, { fetchFn: ctl.fetchFn });
    if (!identity)
        return session;
    const next = { ...session };
    if (identity.account)
        next.account = identity.account;
    if (identity.userId)
        next.userId = identity.userId;
    if (identity.planType)
        next.planType = identity.planType;
    if (identity.organizationName)
        next.organizationName = identity.organizationName;
    return next;
}
export async function rememberClineIdentity(ctl, row, quota) {
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
    const nextId = accountIdOf('cline', next);
    if (nextId !== row.id && isClineOpaqueAccount(row.id)) {
        const saved = await replaceAccountId('cline', row, next, ctl.authPath);
        if (!saved)
            return;
        ctl.quota.clear('cline', row.id);
        await ctl.quota.ensure('cline', saved.id, saved.session);
        return;
    }
    await updateAccountSession('cline', row, next, ctl.authPath);
}
/**
 * Cline login is two hops: the WorkOS device poll yields a WorkOS token
 * pair, and `/api/v1/auth/register` exchanges it for the Cline session
 * (`usr-…` account id + refresh token). Only the second hop produces
 * something this plugin can use.
 */
export async function completeClineDevice(ctl, attempt) {
    try {
        const tokens = await attempt.waitToken();
        const session = await finishClineSession(ctl, await registerClineTokens(tokens, { fetchFn: ctl.fetchFn }));
        await saveSession('cline', session, ctl.authPath);
        ctl.lastError.delete('cline');
        await discoverCline(ctl, session);
        ctl.onAuthChanged?.('cline');
        void ctl.quota.refresh('cline');
    }
    catch (error) {
        if (!(error instanceof Error && error.message === 'login cancelled')) {
            ctl.lastError.set('cline', error instanceof Error ? error.message : String(error));
        }
    }
    finally {
        ctl.finalizing.delete('cline');
    }
}
