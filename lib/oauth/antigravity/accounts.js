/**
 * Antigravity account lifecycle for AuthController: PKCE login start and code
 * exchange, plan write-back, and the Google validation probe.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import { updateAccountSession } from '../store.js';
import { antigravityFlow, applyAntigravityValidation, exchangeAntigravityCode, probeAntigravityValidation, } from './index.js';
export async function rememberAntigravityPlan(ctl, row, quota) {
    if (!quota || quota.status !== 'ready')
        return;
    const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined;
    if (!planType || row.session.planType === planType)
        return;
    await updateAccountSession('antigravity', row, { ...row.session, planType }, ctl.authPath);
}
export async function probeAntigravity(ctl, source) {
    try {
        const info = await probeAntigravityValidation(source.session, { fetchFn: ctl.fetchFn });
        if (info === undefined)
            return;
        const next = applyAntigravityValidation(source.session, info);
        await updateAccountSession('antigravity', source, next, ctl.authPath);
    }
    catch {
        // probe is best-effort; quota / login must still succeed
    }
}
export async function loginAntigravity(ctl) {
    const attempt = await ctl.flows.start('antigravity', antigravityFlow);
    const claim = ctl.claim('antigravity');
    void ctl.completePkce('antigravity', attempt, claim);
    return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'oauth' };
}
export async function completeAntigravityPaste(ctl, code, attempt) {
    return exchangeAntigravityCode(code, attempt.redirectUri, { fetchFn: ctl.fetchFn });
}
