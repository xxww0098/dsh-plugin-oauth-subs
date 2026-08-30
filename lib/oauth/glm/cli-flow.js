/**
 * ZCode CLI poll login. The browser opens authorize_url; the plugin polls
 * until the flow is ready. No loopback, no PKCE, no user code.
 * `region` is `zai` (global) or `bigmodel` (China); the CLI provider id
 * posted to /oauth/cli/init is `zai` or `bigmodel`.
 */
import { completeGlmCli, glmCliInit, glmCliPoll } from './index.js';
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
            return;
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
export class GlmCliFlowManager {
    constructor() {
        this.attempts = new Map();
    }
    isBusy(provider) {
        return this.attempts.has(provider);
    }
    pending(provider) {
        return this.attempts.get(provider);
    }
    async start(provider, { region = 'zai', fetchFn = fetch } = {}) {
        if (this.attempts.has(provider)) {
            throw new Error(`a ${provider} login attempt is already in progress`);
        }
        const started = await glmCliInit({ region, fetchFn });
        const controller = new AbortController();
        let resolveToken;
        let rejectToken;
        const tokenPromise = new Promise((resolve, reject) => {
            resolveToken = resolve;
            rejectToken = reject;
        });
        tokenPromise.catch(() => undefined);
        const settle = (error, ready) => {
            if (this.attempts.get(provider) !== attempt)
                return;
            this.attempts.delete(provider);
            if (error)
                rejectToken(error);
            else
                resolveToken(ready);
        };
        const attempt = {
            authorizeUrl: started.authorizeUrl,
            flowId: started.flowId,
            mode: 'cli',
            waitToken: () => tokenPromise,
            cancel: () => {
                controller.abort(new Error('login cancelled'));
                settle(new Error('login cancelled'));
            },
        };
        this.attempts.set(provider, attempt);
        void (async () => {
            try {
                while (!controller.signal.aborted) {
                    if (Date.now() >= started.expiresAt)
                        throw new Error('glm login timed out');
                    const poll = await glmCliPoll({
                        flowId: started.flowId,
                        pollToken: started.pollToken,
                        fetchFn,
                    });
                    if (poll.ready) {
                        const session = await completeGlmCli(poll, { fetchFn, region });
                        settle(undefined, session);
                        return;
                    }
                    await sleep(started.intervalMs, controller.signal);
                }
            }
            catch (error) {
                settle(error instanceof Error ? error : new Error(String(error)));
            }
        })();
        return attempt;
    }
}
