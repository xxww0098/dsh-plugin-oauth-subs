import { outboundFetch } from '../../utils/outbound.js';
import { createFlowAttempts, sleep } from '../flow.js';
/**
 * RFC 8628 device-authorization flow. The user opens a verification URL and
 * types a short code while the plugin polls the token endpoint.
 */
const DEFAULT_INTERVAL_SEC = 5;
const DEFAULT_EXPIRES_IN_SEC = 900;
export class DeviceFlowManager {
    constructor() {
        this.attempts = createFlowAttempts();
    }
    isBusy(provider) {
        return this.attempts.isBusy(provider);
    }
    pending(provider) {
        return this.attempts.pending(provider);
    }
    async start(provider, spec) {
        const slot = this.attempts.begin(provider);
        const fetchFn = spec.fetchFn ?? outboundFetch;
        const extraHeaders = spec.headers && typeof spec.headers === 'object' ? spec.headers : {};
        const useJson = spec.jsonBody === true;
        const devicePayload = { client_id: spec.clientId };
        if (typeof spec.scope === 'string' && spec.scope)
            devicePayload.scope = spec.scope;
        const encode = (payload) => (useJson ? JSON.stringify(payload) : new URLSearchParams(payload).toString());
        const contentType = useJson ? 'application/json' : 'application/x-www-form-urlencoded';
        const requestDevice = () => fetchFn(spec.deviceCodeUrl, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': contentType,
                ...extraHeaders,
            },
            body: encode(devicePayload),
        });
        let response;
        let wire;
        try {
            response = await requestDevice();
            if (!response.ok) {
                throw new Error(`${provider} device-code request failed (HTTP ${response.status})`);
            }
            wire = await response.json();
        }
        catch (error) {
            slot.abandon();
            throw error;
        }
        if (typeof wire.device_code !== 'string' || wire.device_code.length === 0
            || typeof wire.user_code !== 'string' || wire.user_code.length === 0
            || typeof wire.verification_uri !== 'string' || wire.verification_uri.length === 0) {
            throw new Error(`${provider} device-code response is missing device_code/user_code/verification_uri`);
        }
        const intervalSec = typeof wire.interval === 'number' && wire.interval > 0
            ? wire.interval
            : DEFAULT_INTERVAL_SEC;
        const expiresInSec = typeof wire.expires_in === 'number' && wire.expires_in > 0
            ? wire.expires_in
            : DEFAULT_EXPIRES_IN_SEC;
        const poll = async () => {
            // Bound the restart loop: a server that keeps answering expired_token
            // must not spin here forever.
            const maxRestarts = 3;
            let restarts = 0;
            let current = wire;
            let intervalMs = intervalSec * 1000;
            let expiresSec = expiresInSec;
            let deadline = Date.now() + expiresSec * 1000;
            while (true) {
                await sleep(intervalMs, slot.signal);
                if (Date.now() >= deadline) {
                    slot.settle(new Error(`login timed out after ${Math.round(expiresSec)}s`));
                    return;
                }
                const pollResponse = await fetchFn(spec.tokenUrl, {
                    method: 'POST',
                    headers: {
                        accept: 'application/json',
                        'content-type': contentType,
                        ...extraHeaders,
                    },
                    body: encode({
                        client_id: spec.clientId,
                        device_code: current.device_code,
                        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                    }),
                    signal: slot.signal,
                });
                const result = await pollResponse.json().catch(() => ({}));
                if (typeof result.access_token === 'string' && result.access_token.length > 0) {
                    slot.settle(undefined, result);
                    return;
                }
                switch (result.error) {
                    case 'authorization_pending':
                        break;
                    case 'slow_down':
                        intervalMs += 5000;
                        break;
                    case 'access_denied':
                        slot.settle(new Error('login declined on the authorization page'));
                        return;
                    case 'expired_token':
                        if (spec.restartOnExpired) {
                            if (restarts >= maxRestarts) {
                                slot.settle(new Error('the device code expired before authorization completed'));
                                return;
                            }
                            restarts += 1;
                            const nextResponse = await requestDevice();
                            if (!nextResponse.ok) {
                                slot.settle(new Error(`the device code expired before authorization completed`));
                                return;
                            }
                            const next = await nextResponse.json();
                            if (typeof next.device_code !== 'string' || typeof next.user_code !== 'string') {
                                slot.settle(new Error('the device code expired before authorization completed'));
                                return;
                            }
                            current = next;
                            const nextInterval = typeof next.interval === 'number' && next.interval > 0 ? next.interval : DEFAULT_INTERVAL_SEC;
                            expiresSec = typeof next.expires_in === 'number' && next.expires_in > 0 ? next.expires_in : DEFAULT_EXPIRES_IN_SEC;
                            intervalMs = nextInterval * 1000;
                            deadline = Date.now() + expiresSec * 1000;
                            if (slot.owns(attempt)) {
                                attempt.verificationUrl = next.verification_uri_complete ?? next.verification_uri;
                                attempt.verificationUri = next.verification_uri;
                                attempt.userCode = next.user_code;
                            }
                            break;
                        }
                        slot.settle(new Error('the device code expired before authorization completed'));
                        return;
                    default:
                        slot.settle(new Error(`${provider} device-flow polling failed: ${result.error_description ?? result.error ?? `HTTP ${pollResponse.status}`}`));
                        return;
                }
            }
        };
        const attempt = slot.publish({
            verificationUrl: wire.verification_uri_complete ?? wire.verification_uri,
            verificationUri: wire.verification_uri,
            userCode: wire.user_code,
        });
        void poll().catch((error) => {
            slot.settle(error instanceof Error ? error : new Error(String(error)));
        });
        return attempt;
    }
}
