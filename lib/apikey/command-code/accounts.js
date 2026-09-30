/**
 * Command Code account lifecycle for AuthController: auth.json auto-import, whoami identity, and
 * the loopback-callback login completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import { describeError, errorCode, errorMessage } from '../../utils/http.js';
import { accountIdOf, listStoredSessions, replaceAccountId, saveSession, updateAccountSession, } from '../../oauth/store.js';
import { commandCodeSessionFromCallback, isCommandCodeOpaqueAccount, resolveCommandCodeIdentity, } from './index.js';
import { COMMAND_CODE_IMPORT_EMPTY, importCommandCodeAuth } from './import.js';
import { signedOutOf } from '../../oauth/account-marks.js';
export async function maybeAutoImportCommandCode(ctl) {
    if (!ctl.commandCodeAutoImport || ctl.commandCodeAutoImportTried)
        return;
    ctl.commandCodeAutoImportTried = true;
    if (await signedOutOf(ctl, 'command-code'))
        return;
    const rows = await listStoredSessions('command-code', ctl.authPath);
    if (rows.length > 0)
        return;
    try {
        const result = await importCommandCodeAuth({ env: process.env, ...ctl.commandCodeImport });
        if (result?.session) {
            const session = await finishCommandCodeSession(ctl, result.session);
            await saveSession('command-code', session, ctl.authPath);
            ctl.onAuthChanged?.('command-code');
            void ctl.quota.refresh('command-code');
        }
    }
    catch (error) {
        if (errorCode(error) !== COMMAND_CODE_IMPORT_EMPTY && errorMessage(error) !== COMMAND_CODE_IMPORT_EMPTY) {
            // no env key and no CLI auth.json is fine; other faults stay off the banner
        }
    }
}
export async function importCommandCode(ctl) {
    const existing = await listStoredSessions('command-code', ctl.authPath);
    const result = await importCommandCodeAuth({ env: process.env, ...ctl.commandCodeImport });
    const incomingId = accountIdOf('command-code', result.session);
    // Same key via a different source (paste vs auth.json) must not mint a
    // second account row — the bearer is the identity here, not the id shape.
    const hit = existing.find((row) => row.id === incomingId || row.session?.accessToken === result.session.accessToken);
    if (hit) {
        return { source: hit.session.source, session: hit.session, skipped: true };
    }
    return { ...result, session: await finishCommandCodeSession(ctl, result.session) };
}
export async function finishCommandCodeSession(ctl, session) {
    const identity = await resolveCommandCodeIdentity(session, { fetchFn: ctl.fetchFn });
    if (!identity)
        return session;
    const next = { ...session };
    if (identity.account)
        next.account = identity.account;
    if (identity.id)
        next.userId = identity.id;
    if (identity.userName)
        next.userName = identity.userName;
    if (identity.email)
        next.email = identity.email;
    if (identity.orgId)
        next.orgId = identity.orgId;
    return next;
}
export async function rememberCommandCodeIdentity(ctl, row, quota) {
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
    const nextId = accountIdOf('command-code', next);
    if (nextId !== row.id && isCommandCodeOpaqueAccount(row.id)) {
        const saved = await replaceAccountId('command-code', row, next, ctl.authPath);
        if (!saved)
            return;
        ctl.quota.clear('command-code', row.id);
        await ctl.quota.ensure('command-code', saved.id, saved.session);
        return;
    }
    await updateAccountSession('command-code', row, next, ctl.authPath);
}
/**
 * Command Code's waitCode resolves with the callback credentials
 * {apiKey,userId,userName,keyName} — the session builds directly, there is
 * no token exchange (flow.ts collect() already state-checked the callback).
 */
export async function completeCommandCode(ctl, attempt, claim) {
    try {
        const credentials = await attempt.waitCode();
        if (ctl.claims.get('command-code') !== claim)
            return;
        const session = await finishCommandCodeSession(ctl, commandCodeSessionFromCallback(credentials));
        await saveSession('command-code', session, ctl.authPath);
        ctl.lastError.delete('command-code');
        ctl.onAuthChanged?.('command-code');
        void ctl.quota.refresh('command-code');
    }
    catch (error) {
        if (ctl.claims.get('command-code') !== claim)
            return;
        if (!(error instanceof Error && error.message === 'login cancelled')) {
            ctl.lastError.set('command-code', describeError(error));
        }
    }
}
