/**
 * GLM account lifecycle for AuthController: identity re-resolution and CLI login completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import { accountIdOf, listStoredSessions, replaceAccountId, saveSession, updateAccountSession, } from '../store.js';
import { pickGlmHumanAccount, resolveGlmIdentity } from './index.js';
import { identityDue } from '../account-marks.js';
export async function resolveGlmIdentities(ctl) {
    // Keep the strict check: an opaque letters+digits id (poll user.id like
    // dnarplz6) must re-resolve to an email/name. A resolved username that is
    // also letters+digits (xxww0098) re-resolves once and is a no-op when
    // userinfo returns the same value — displayGlmAccount shows it meanwhile.
    const rows = identityDue(ctl, 'glm', await listStoredSessions('glm', ctl.authPath), pickGlmHumanAccount);
    await Promise.all(rows.map(async (row) => {
        const account = await resolveGlmIdentity(row.session, { fetchFn: ctl.fetchFn }).catch(() => undefined);
        if (!account || account === row.session.account)
            return;
        const next = { ...row.session, account, displayName: account };
        const nextId = accountIdOf('glm', next);
        if (nextId !== row.id) {
            await replaceAccountId('glm', row, next, ctl.authPath);
            ctl.quota.clear('glm', row.id);
        }
        else {
            await updateAccountSession('glm', row, next, ctl.authPath);
        }
    }));
}
export async function completeGlm(ctl, attempt) {
    try {
        const session = await attempt.waitToken();
        await saveSession('glm', session, ctl.authPath);
        ctl.lastError.delete('glm');
        ctl.onAuthChanged?.('glm');
        void ctl.quota.refresh('glm');
    }
    catch (error) {
        if (!(error instanceof Error && error.message === 'login cancelled')) {
            ctl.lastError.set('glm', error instanceof Error ? error.message : String(error));
        }
    }
    finally {
        ctl.finalizing.delete('glm');
    }
}
