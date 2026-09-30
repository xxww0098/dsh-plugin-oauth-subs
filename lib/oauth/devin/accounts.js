/**
 * Devin account lifecycle for AuthController: live catalog discovery, credentials.toml
 * auto-import, and identity.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import { errorCode, errorMessage } from '../../utils/http.js';
import { accountIdOf, listStoredSessions, replaceAccountId, saveSession, updateAccountSession, } from '../store.js';
import { isDevinOpaqueAccount, isDevinSessionToken, pickDevinHumanAccount } from './index.js';
import { DEVIN_IMPORT_EMPTY, importDevinAuth } from './import.js';
import { devinCatalogModels } from './catalog.js';
import { resolveDevinIdentity } from './transport.js';
import { signedOutOf } from '../account-marks.js';
export async function discoverDevin(ctl, session) {
    if (!session || typeof ctl.devinDiscover !== 'function')
        return devinCatalogModels();
    try {
        return await ctl.devinDiscover(session, { fetchFn: ctl.fetchFn });
    }
    catch {
        return devinCatalogModels();
    }
}
export async function maybeAutoImportDevin(ctl) {
    if (!ctl.devinAutoImport || ctl.devinAutoImportTried)
        return;
    ctl.devinAutoImportTried = true;
    if (await signedOutOf(ctl, 'devin'))
        return;
    const rows = await listStoredSessions('devin', ctl.authPath);
    // A foreign-shaped row (wrong-prefix token) is not a devin login; it must
    // not block the CLI import. Its refresh 401s out via isPermanentRefreshFailure.
    if (rows.some((row) => isDevinSessionToken(row?.session?.accessToken)))
        return;
    try {
        const result = await importDevinAuth({ ...ctl.devinImport });
        if (result?.session) {
            const session = await finishDevinSession(ctl, result.session);
            await saveSession('devin', session, ctl.authPath);
            await discoverDevin(ctl, session);
            ctl.onAuthChanged?.('devin');
            void ctl.quota.refresh('devin');
        }
    }
    catch (error) {
        if (errorCode(error) !== DEVIN_IMPORT_EMPTY && errorMessage(error) !== DEVIN_IMPORT_EMPTY) {
            // missing credentials.toml is fine; other faults stay off the Settings banner
        }
    }
}
export async function importDevin(ctl) {
    const existing = await listStoredSessions('devin', ctl.authPath);
    const result = await importDevinAuth({ ...ctl.devinImport });
    const incomingId = accountIdOf('devin', result.session);
    const hit = existing.find((row) => row.id === incomingId);
    if (hit) {
        return { source: hit.session.source, session: hit.session, skipped: true };
    }
    return { ...result, session: await finishDevinSession(ctl, result.session) };
}
export async function finishDevinSession(ctl, session) {
    const identity = await resolveDevinIdentity(session, { fetchFn: ctl.fetchFn }).catch(() => undefined);
    if (!identity)
        return session;
    const next = { ...session };
    const account = pickDevinHumanAccount(identity.account);
    if (account)
        next.account = account;
    if (identity.planType)
        next.planType = identity.planType;
    return next;
}
export async function rememberDevinIdentity(ctl, row, quota) {
    if (!quota || quota.status !== 'ready')
        return;
    const account = pickDevinHumanAccount(quota.account);
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
    const nextId = accountIdOf('devin', next);
    if (nextId !== row.id && isDevinOpaqueAccount(row.id)) {
        const saved = await replaceAccountId('devin', row, next, ctl.authPath);
        if (!saved)
            return;
        ctl.quota.clear('devin', row.id);
        await ctl.quota.ensure('devin', saved.id, saved.session);
        return;
    }
    await updateAccountSession('devin', row, next, ctl.authPath);
}
