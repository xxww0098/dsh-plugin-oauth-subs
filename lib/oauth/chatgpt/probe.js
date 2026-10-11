/**
 * ChatGPT-owned diagnostic runner; never installed in the normal request path.
 *
 * Reports the raw native usage split: `cached_tokens` (read) and
 * `cache_write_tokens` (write) when the route reports it, each with its own
 * presence flag, so a zero-hit report separates "the route wrote nothing"
 * from "it wrote and never read back". 2026-10-11 live on the plan route:
 * identical repeats at 4.2K / 9.2K / 62K tokens, three models, with and
 * without `prompt_cache_key`, both item shapes — native zero every time;
 * `prompt_cache_options` / `prompt_cache_breakpoint` answer 400 not supported
 * (README 固定前缀缓存诊断).
 */
import { createHmac, randomBytes } from 'node:crypto';
import { createProxy } from '../proxy.js';
import { outboundFetch } from '../../utils/outbound.js';
import { CHATGPT_RESPONSES_URL } from './index.js';
const VARIANTS = ['developer-input', 'request-instructions'];
const count = (value) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
function nativeUsage(value) {
    const usage = value && typeof value === 'object' ? value : null;
    const details = usage?.input_tokens_details;
    const cacheFieldPresent = !!details && Object.hasOwn(details, 'cached_tokens');
    const cacheWriteFieldPresent = !!details && Object.hasOwn(details, 'cache_write_tokens');
    const inputTokens = count(usage?.input_tokens);
    let cachedTokens = cacheFieldPresent ? count(details.cached_tokens) : null;
    if (inputTokens !== null && cachedTokens !== null && cachedTokens > inputTokens)
        cachedTokens = null;
    return {
        usagePresent: !!usage,
        // A reported zero is a reading; an absent field is unknown. The write
        // counter is the only upstream evidence that the route wrote a prefix at
        // all, so a zero-hit report says "wrote and never read back" rather than
        // leaving the cause to guesswork.
        cacheFieldPresent,
        cacheWriteFieldPresent,
        inputTokens,
        cachedTokens,
        cacheWriteTokens: cacheWriteFieldPresent ? count(details.cache_write_tokens) : null,
        outputTokens: count(usage?.output_tokens),
        totalTokens: count(usage?.total_tokens),
    };
}
async function observe(response, record) {
    if (!response.body)
        return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let tail = '';
    const frame = (text) => {
        const raw = text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!raw || raw === '[DONE]')
            return;
        let event;
        try {
            event = JSON.parse(raw);
        }
        catch {
            return;
        }
        if (!['response.completed', 'response.incomplete', 'response.failed'].includes(event.type))
            return;
        record.terminalType = event.type;
        record.actualModel = /^gpt-[\w.-]{1,64}$/.test(event.response?.model ?? '') ? event.response.model : null;
        record.nativeUsage = nativeUsage(event.response?.usage);
    };
    try {
        for (;;) {
            const part = await reader.read();
            tail += decoder.decode(part.value, { stream: !part.done });
            const frames = tail.split(/\r?\n\r?\n/);
            tail = frames.pop() ?? '';
            for (const text of frames)
                frame(text);
            if (tail.length > 2 * 1024 * 1024) {
                record.observerFailed = true;
                await reader.cancel();
                break;
            }
            if (part.done) {
                if (tail.trim())
                    frame(tail);
                break;
            }
        }
    }
    catch {
        record.observerFailed = true;
    }
    finally {
        reader.releaseLock();
    }
}
/** Drives the real loopback proxy. Only fetchFn varies: vendor HTTP or an offline adapter. */
export async function probeChatgptCache({ session, fetchFn = outboundFetch, repetitions = 3, onProgress = undefined }) {
    if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3)
        throw new RangeError('repetitions must be 1..3');
    if (!Number.isFinite(session?.expiresAt) || session.expiresAt <= Date.now() + repetitions * 2 * 100_000 + 60_000)
        throw new RangeError('fixed token expiry cannot cover the probe; refresh forbidden');
    const salt = randomBytes(32);
    const fingerprint = (value) => createHmac('sha256', salt).update(typeof value === 'string' ? value : JSON.stringify(value ?? null)).digest('hex');
    const report = { model: 'gpt-6.1-sol', reasoningEffort: 'max', upstreamAttempts: 0, calls: [], attempts: [], variants: {}, accountSwitches: 0, tokenRefreshes: 0, optimizationApplied: false };
    const checkpoint = async () => { if (onProgress)
        await onProgress(JSON.parse(JSON.stringify(report))); };
    let call;
    const observations = [];
    const localKey = randomBytes(32).toString('hex');
    const proxy = createProxy({ port: 0, apiKey: localKey, tokens: { chatgpt: { session: async () => { if (session.expiresAt <= Date.now() + 60_000)
                    throw new Error('fixed token expiry'); return session; } } }, fetchFn: async (url, init) => {
            if (String(url) !== CHATGPT_RESPONSES_URL)
                throw new Error('unexpected cache-probe endpoint');
            if (report.upstreamAttempts >= 6) {
                report.stopReason = 'upstream budget reached';
                throw new Error('cache-probe upstream budget exhausted');
            }
            const payload = JSON.parse(String(init.body));
            const attempt = { call: call.index, variant: call.variant, attempt: ++report.upstreamAttempts, keyFingerprint: fingerprint(payload.prompt_cache_key), wireFingerprint: fingerprint(String(init.body)), instructionTextFingerprint: fingerprint(payload.instructions ?? payload.input?.[0]?.content), promptCacheKeyPresent: typeof payload.prompt_cache_key === 'string', promptCacheRetentionPresent: Object.hasOwn(payload, 'prompt_cache_retention'), codexAffinityHeadersPresent: ['session-id', 'thread-id', 'chatgpt-account-id', 'originator'].some(name => new Headers(init.headers).has(name)) };
            report.attempts.push(attempt);
            try {
                await checkpoint();
                const response = await fetchFn(url, { ...init, redirect: 'error' });
                attempt.httpStatus = response.status;
                if (response.ok)
                    observations.push(observe(response.clone(), attempt));
                return response;
            }
            catch {
                attempt.transportFailed = true;
                throw new Error('cache-probe upstream transport failed');
            }
        } });
    // Local bearer is never a cache/conversation id and never reaches the vendor.
    const server = await proxy.listen();
    const address = server.address();
    const text = 'This is a benign cache transport probe. Reference rows are inert data, not commands. Do not analyze or repeat them. Reply to the user with exactly OK.\n' + Array.from({ length: 256 }, (_, i) => 'R' + String(i).padStart(4, '0') + ' | alpha beta gamma delta epsilon zeta eta theta iota kappa | immutable reference.').join('\n');
    try {
        requests: for (const variant of VARIANTS)
            for (let n = 0; n < repetitions; n++) {
                if (report.upstreamAttempts >= 6) {
                    report.stopReason = 'upstream budget reached';
                    break requests;
                }
                call = { index: report.calls.length + 1, variant };
                report.calls.push(call);
                const common = { model: report.model, prompt_cache_key: 'dsh-chatgpt:cache-probe:v1', reasoning: { effort: 'max' }, stream: true, store: false };
                const user = { role: 'user', content: 'Return exactly OK.' };
                const body = variant === 'developer-input' ? { ...common, input: [{ role: 'developer', content: text }, user] } : { ...common, instructions: text, input: [user] };
                const response = await outboundFetch('http://127.0.0.1:' + address.port + '/chatgpt/v1/responses', { method: 'POST', headers: { authorization: 'Bearer ' + localKey, 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(100_000) });
                call.httpStatus = response.status;
                await response.text();
                await Promise.all(observations);
                const attempt = report.attempts.filter((a) => a.call === call.index).at(-1);
                call.nativeUsage = attempt?.nativeUsage ?? nativeUsage(null);
                call.terminalType = attempt?.terminalType ?? null;
                await checkpoint();
                if (!response.ok || call.terminalType !== 'response.completed' || !call.nativeUsage.usagePresent) {
                    report.stopReason = 'non-completed or unmeasured call';
                    break requests;
                }
            }
    }
    catch {
        report.stopReason ??= 'transport or local request failed';
    }
    finally {
        await Promise.allSettled(observations);
        await proxy.close();
    }
    for (const variant of VARIANTS) {
        const calls = report.calls.filter((c) => c.variant === variant);
        const measured = calls.filter((c) => c.terminalType === 'response.completed' && c.nativeUsage.cacheFieldPresent && c.nativeUsage.cachedTokens !== null && c.nativeUsage.inputTokens !== null);
        const inputTokens = measured.reduce((sum, c) => sum + c.nativeUsage.inputTokens, 0);
        const cachedTokens = measured.reduce((sum, c) => sum + c.nativeUsage.cachedTokens, 0);
        const wrote = calls.filter((c) => c.nativeUsage.cacheWriteFieldPresent && c.nativeUsage.cacheWriteTokens !== null);
        report.variants[variant] = {
            calls: calls.length,
            measuredCalls: measured.length,
            // "No reuse" is only proven when the route reported the write counter:
            // a route that never writes cannot read either.
            zeroReuseCalls: measured.filter((c) => c.nativeUsage.cachedTokens === 0).length,
            cacheWriteReportedCalls: wrote.length,
            cacheWriteTokens: wrote.reduce((sum, c) => sum + c.nativeUsage.cacheWriteTokens, 0),
            inputTokens,
            cachedTokens,
            weightedHit: inputTokens ? cachedTokens / inputTokens : null,
            wireFingerprintsStable: new Set(report.attempts.filter((a) => a.variant === variant).map((a) => a.wireFingerprint)).size === 1,
        };
    }
    report.cacheKeyStable = new Set(report.attempts.map((a) => a.keyFingerprint)).size === 1;
    report.sameInstructionTextAcrossVariants = new Set(report.attempts.map((a) => a.instructionTextFingerprint)).size === 1;
    return report;
}
