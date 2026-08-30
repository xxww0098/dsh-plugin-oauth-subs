/**
 * Auth controller behind the Settings page RPC.
 * Codex PKCE (+ paste callback + import), Grok device-code (primary) + PKCE fallback.
 */
import { OAuthFlowManager } from './flow.js';
import { DeviceFlowManager } from './grok/device-flow.js';
import { deleteSession, getSession, listAccounts, publicSession, saveSession, switchAccount } from './store.js';
import { codexFlow, exchangeCodexCode, isCodexPermanentRefreshError, refreshCodex, } from './codex/index.js';
import { completeGrokDevice, grokDeviceSpec, grokFlow, exchangeGrokCode, isGrokPermanentRefreshError, refreshGrok, } from './grok/index.js';
import { importCodexAuth, importGrokAuth } from './import-auth.js';
import { buildProviders, catalogProviders, describeCatalog, describeProviders, filterProviders, ModelSwitch, syncHarnessModels, } from './models.js';
import { TokenManager } from './tokens.js';
import { QuotaStore } from './quota.js';
import { fetchLatest, localUpdateInfo } from '../utils/update.js';
export class AuthController {
    constructor({ authPath, prefix, origin, settings, grokLogin = 'device', onAuthChanged, models, fetchFn = fetch, quotaTtlMs }) {
        this.authPath = authPath;
        this.prefix = prefix;
        this.origin = origin;
        this.settings = settings;
        this.grokLogin = grokLogin;
        this.onAuthChanged = onAuthChanged;
        this.models = models ?? new ModelSwitch();
        this.flows = new OAuthFlowManager();
        this.devices = new DeviceFlowManager();
        this.lastError = new Map();
        this.finalizing = new Set();
        this.claims = new Map();
        this.tokens = {
            codex: new TokenManager({
                displayName: 'ChatGPT (Codex)',
                preemptMs: 5 * 60_000,
                load: () => getSession('codex', this.authPath),
                save: (session) => saveSession('codex', session, this.authPath),
                remove: () => deleteSession('codex', this.authPath),
                refresh: refreshCodex,
                isPermanent: isCodexPermanentRefreshError,
                onRemoved: () => this.onAuthChanged?.('codex'),
            }),
            grok: new TokenManager({
                displayName: 'Grok (Subscription)',
                preemptMs: 2 * 60_000,
                load: () => getSession('grok', this.authPath),
                save: (session) => saveSession('grok', session, this.authPath),
                remove: () => deleteSession('grok', this.authPath),
                refresh: refreshGrok,
                isPermanent: isGrokPermanentRefreshError,
                onRemoved: () => this.onAuthChanged?.('grok'),
            }),
        };
        this.quota = new QuotaStore({ tokens: this.tokens, fetchFn, ttlMs: quotaTtlMs });
        this.fetchFn = fetchFn;
    }
    claim(provider) {
        const next = (this.claims.get(provider) ?? 0) + 1;
        this.claims.set(provider, next);
        return next;
    }
    async loggedIn() {
        return {
            codex: (await getSession('codex', this.authPath)) !== undefined,
            grok: (await getSession('grok', this.authPath)) !== undefined,
        };
    }
    async status(provider) {
        const session = await getSession(provider, this.authPath);
        const detail = this.lastError.get(provider);
        const pub = publicSession(provider, session);
        return {
            loggedIn: session !== undefined,
            busy: this.flows.isBusy(provider) || this.devices.isBusy(provider) || this.finalizing.has(provider),
            ...pub,
            quota: this.quota.peek(provider),
            ...(detail === undefined ? {} : { detail }),
        };
    }
    catalog() {
        return catalogProviders({ prefix: this.prefix, origin: this.origin() });
    }
    async snapshot() {
        await this.models.ready;
        const loggedIn = await this.loggedIn();
        const origin = this.origin();
        const catalog = catalogProviders({ prefix: this.prefix, origin });
        const selected = this.models.selectedForSync(catalog);
        const providers = filterProviders(buildProviders({
            prefix: this.prefix,
            origin,
            loggedIn,
        }), selected);
        if (loggedIn.codex)
            await this.quota.ensure('codex');
        else
            this.quota.clear('codex');
        if (loggedIn.grok)
            await this.quota.ensure('grok');
        else
            this.quota.clear('grok');
        const enabledKeys = this.models.enabledKeys(catalog);
        const [codexAccounts, grokAccounts] = await Promise.all([
            listAccounts('codex', this.authPath),
            listAccounts('grok', this.authPath),
        ]);
        return {
            origin,
            grokLogin: this.grokLogin,
            catalog: describeCatalog(catalog, { enabledKeys, loggedIn }),
            providers: describeProviders(providers),
            selected: enabledKeys,
            accounts: {
                codex: { ...(await this.status('codex')), activeId: codexAccounts.find((row) => row.active)?.id, accounts: codexAccounts },
                grok: { ...(await this.status('grok')), activeId: grokAccounts.find((row) => row.active)?.id, accounts: grokAccounts },
            },
            update: localUpdateInfo(),
        };
    }
    async refreshQuota(provider) {
        if (provider === 'codex' || provider === 'grok') {
            return this.quota.refresh(provider);
        }
        const [codex, grok] = await Promise.all([this.quota.refresh('codex'), this.quota.refresh('grok')]);
        return { codex, grok };
    }
    async checkUpdate() {
        try {
            return await fetchLatest({ fetchFn: this.fetchFn, platform: process.platform });
        }
        catch (error) {
            return {
                ...localUpdateInfo(),
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                latest: undefined,
                assets: [],
            };
        }
    }
    async consumeReset(provider) {
        if (provider !== 'codex')
            throw new Error('only ChatGPT Codex can reset quota');
        return this.quota.consume('codex');
    }
    async login(provider, mode) {
        if (provider === 'codex') {
            const attempt = await this.flows.start('codex', codexFlow);
            const claim = this.claim('codex');
            void this.completePkce('codex', attempt, claim);
            return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' };
        }
        const useDevice = (mode ?? this.grokLogin) !== 'pkce';
        if (useDevice) {
            const attempt = await this.devices.start('grok', await grokDeviceSpec());
            this.finalizing.add('grok');
            void this.completeDevice('grok', attempt);
            return {
                authorizeUrl: attempt.verificationUrl,
                verificationUri: attempt.verificationUri,
                userCode: attempt.userCode,
                mode: 'device',
            };
        }
        const attempt = await this.flows.start('grok', await grokFlow());
        const claim = this.claim('grok');
        void this.completePkce('grok', attempt, claim);
        return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' };
    }
    async completePkce(provider, attempt, claim) {
        try {
            const code = await attempt.waitCode();
            const session = provider === 'codex'
                ? await exchangeCodexCode(code, attempt.pkce.verifier, attempt.redirectUri)
                : await exchangeGrokCode(code, attempt.pkce.verifier, attempt.redirectUri, attempt.pkce.challenge);
            if (this.claims.get(provider) !== claim)
                return;
            await saveSession(provider, session, this.authPath);
            this.lastError.delete(provider);
            this.onAuthChanged?.(provider);
            void this.quota.refresh(provider);
        }
        catch (error) {
            if (this.claims.get(provider) !== claim)
                return;
            if (!(error instanceof Error && error.message === 'login cancelled')) {
                this.lastError.set(provider, error.message);
            }
        }
    }
    async completeDevice(provider, attempt) {
        try {
            const tokens = await attempt.waitToken();
            const session = await completeGrokDevice(tokens);
            await saveSession(provider, session, this.authPath);
            this.lastError.delete(provider);
            this.onAuthChanged?.(provider);
            void this.quota.refresh(provider);
        }
        catch (error) {
            if (!(error instanceof Error && error.message === 'login cancelled')) {
                this.lastError.set(provider, error.message);
            }
        }
        finally {
            this.finalizing.delete(provider);
        }
    }
    async manual(provider, input) {
        const attempt = this.flows.pending(provider);
        if (attempt === undefined)
            throw new Error(`no ${provider} login attempt is in progress`);
        attempt.manual(input);
    }
    async cancel(provider) {
        this.claim(provider);
        this.flows.pending(provider)?.cancel();
        this.devices.pending(provider)?.cancel();
    }
    async logout(provider, id) {
        this.claim(provider);
        this.flows.pending(provider)?.cancel();
        this.devices.pending(provider)?.cancel();
        await deleteSession(provider, this.authPath, id);
        this.lastError.delete(provider);
        this.quota.clear(provider);
        this.onAuthChanged?.(provider);
        if (await getSession(provider, this.authPath))
            void this.quota.refresh(provider);
    }
    async switchAccount(provider, id) {
        await switchAccount(provider, id, this.authPath);
        this.lastError.delete(provider);
        this.quota.clear(provider);
        this.onAuthChanged?.(provider);
        void this.quota.refresh(provider);
        return this.snapshot();
    }
    async importFrom(provider) {
        const result = provider === 'codex' ? await importCodexAuth() : await importGrokAuth();
        this.claim(provider);
        this.flows.pending(provider)?.cancel();
        this.devices.pending(provider)?.cancel();
        await saveSession(provider, result.session, this.authPath);
        this.lastError.delete(provider);
        this.onAuthChanged?.(provider);
        void this.quota.refresh(provider);
        return { source: result.source, account: publicSession(provider, result.session) };
    }
    async setModels(payload = {}) {
        await this.models.ready;
        const catalog = this.catalog();
        if (Array.isArray(payload.selected)) {
            await this.models.setEnabled(payload.selected, catalog);
        }
        else if (typeof payload.key === 'string') {
            await this.models.toggle(payload.key, payload.on !== false, catalog);
        }
        else if (payload.family === 'codex' || payload.family === 'grok') {
            await this.models.setFamily(payload.family, payload.on !== false, catalog);
        }
        else if (typeof payload.all === 'boolean') {
            await this.models.setAll(payload.all, catalog);
        }
        else {
            throw new Error('models payload needs selected, key, family, or all');
        }
        if (this.settings && typeof this.settings.mutate === 'function') {
            await this.sync();
        }
        return this.snapshot();
    }
    async sync(selected) {
        if (this.settings === undefined || typeof this.settings.mutate !== 'function') {
            throw new Error('settings service is not mounted; cannot sync llm-pi-ai routes');
        }
        await this.models.ready;
        const catalog = this.catalog();
        if (selected !== undefined) {
            await this.models.setEnabled(selected, catalog);
        }
        const loggedIn = await this.loggedIn();
        return syncHarnessModels({
            settings: this.settings,
            prefix: this.prefix,
            origin: this.origin(),
            loggedIn,
            selected: this.models.selectedForSync(catalog),
        });
    }
}
