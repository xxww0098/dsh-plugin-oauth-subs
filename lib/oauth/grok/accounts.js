/**
 * Grok account lifecycle for AuthController: device / PKCE login start and
 * completion. Functions take the controller as their first argument; the
 * class keeps the public entry points.
 */
import { describeError } from '../../utils/http.js';
import { saveSession } from '../store.js';
import { completeGrokDevice as sessionFromGrokDevice, exchangeGrokCode, grokDeviceSpec, grokFlow, } from './index.js';
export async function loginGrok(ctl, payload = {}) {
    const mode = payload.mode ?? payload.region;
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
export async function completeGrokPaste(ctl, code, attempt) {
    return exchangeGrokCode(code, attempt.pkce.verifier, attempt.redirectUri, attempt.pkce.challenge);
}
export async function completeGrokDeviceFlow(ctl, provider, attempt) {
    try {
        const tokens = await attempt.waitToken();
        const session = await sessionFromGrokDevice(tokens);
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
