/**
 * ZCode CLI poll login. The browser opens authorize_url; the plugin polls
 * until the flow is ready. No loopback, no PKCE, no user code.
 * `region` is `zai` (global) or `bigmodel` (China); the CLI provider id
 * posted to /oauth/cli/init is `zai` or `bigmodel`.
 */
import { GlmBusinessError, GlmHttpError, completeGlmCli, glmCliInit, glmCliPoll } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { createFlowAttempts, sleep } from '../flow.js';
/**
 * Official poll loop (auth-login-polling.ts): transport errors and
 * 5xx / 408 / 429 retry at the server interval; 4xx and business-envelope
 * failures are terminal. A `failed` poll state is terminal immediately —
 * the browser page it belongs to already gave up.
 */
function isTransientGlmPollError(error) {
    if (error instanceof GlmHttpError) {
        return error.status === 408 || error.status === 429 || error.status >= 500;
    }
    if (error instanceof GlmBusinessError)
        return false;
    return true;
}
/**
 * Upstream OAuth incidents the client cannot fix. `3004 invalid_flow` is the
 * server killing the flow while exchanging the browser code — reported for
 * BigModel with the desktop app fully out of the loop (zai-org/feedback#718,
 * related #705). `500 { code: 2007 }` is the token endpoint itself failing
 * (zai-org/feedback#523). Both leave a working fallback: the other region
 * button, or a pasted Coding Plan API key.
 */
export function glmLoginFailureMessage(error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/invalid_flow/i.test(message)) {
        return 'glm authorization failed upstream (invalid_flow): the OAuth server rejected the code exchange — BigModel login is broken server-side (zai-org/feedback#718); retry the other region, or paste a Coding Plan API key in the GLM tab';
    }
    if (/\b2007\b|http error/i.test(message)) {
        return 'glm authorization failed upstream (2007 http error): the OAuth token endpoint is failing (zai-org/feedback#523); retry later, or paste a Coding Plan API key in the GLM tab';
    }
    return message;
}
export class GlmCliFlowManager {
    constructor() {
        this.attempts = createFlowAttempts();
    }
    isBusy(provider) {
        return this.attempts.isBusy(provider);
    }
    pending(provider) {
        return this.attempts.pending(provider);
    }
    async start(provider, { region = 'zai', fetchFn = outboundFetch } = {}) {
        const slot = this.attempts.begin(provider);
        let started;
        try {
            started = await glmCliInit({ region, fetchFn });
        }
        catch (error) {
            slot.abandon();
            throw error;
        }
        const attempt = slot.publish({
            authorizeUrl: started.authorizeUrl,
            flowId: started.flowId,
            mode: 'cli',
        });
        void (async () => {
            try {
                while (!slot.signal.aborted) {
                    if (Date.now() >= started.expiresAt)
                        throw new Error('glm login timed out');
                    let poll;
                    try {
                        poll = await glmCliPoll({
                            flowId: started.flowId,
                            pollToken: started.pollToken,
                            region,
                            fetchFn,
                        });
                    }
                    catch (error) {
                        if (!isTransientGlmPollError(error))
                            throw error;
                        await sleep(started.intervalMs, slot.signal);
                        continue;
                    }
                    if (poll.ready) {
                        const session = await completeGlmCli(poll, { fetchFn, region });
                        slot.settle(undefined, session);
                        return;
                    }
                    if (poll.failed) {
                        throw new Error(poll.message
                            ? `glm authorization failed: ${poll.message}`
                            : 'glm authorization failed; start a new login');
                    }
                    if (poll.unknown) {
                        throw new Error(`glm login poll returned status "${poll.status}"`);
                    }
                    await sleep(started.intervalMs, slot.signal);
                }
            }
            catch (error) {
                slot.settle(new Error(glmLoginFailureMessage(error)));
            }
        })();
        return attempt;
    }
}
