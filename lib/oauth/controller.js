/**
 * Auth controller behind the Settings page RPC.
 * Codex PKCE (+ paste callback + import), Grok device-code (primary) + PKCE fallback.
 */
import { OAuthFlowManager } from './flow.js';
import { DeviceFlowManager } from './grok/device-flow.js';
import { GlmCliFlowManager } from './glm/cli-flow.js';
import { KiroIdcFlowManager } from './kiro/idc-flow.js';
import { accountIdOf, deleteSession, getAccountSession, getSession, listStoredSessions, publicSession, replaceAccountId, saveSession, switchAccount } from './store.js';
import { codexFlow, exchangeCodexCode, isCodexPermanentRefreshError, refreshCodex, } from './codex/index.js';
import { completeGrokDevice, grokDeviceSpec, grokFlow, exchangeGrokCode, isGrokPermanentRefreshError, refreshGrok, } from './grok/index.js';
import { glmSession, isGlmPermanentRefreshError, normalizeGlmRegion, pickGlmHumanAccount, refreshGlm, resolveGlmIdentity, } from './glm/index.js';
import { BUILDER_ID_START_URL, canonicalizeKiroMethod, exchangeKiroSocialCode, isKiroPermanentRefreshError, kiroSession, kiroSocialFlow, refreshKiro, refreshKiroExternalIdp, refreshKiroSocial, validateKiroApiKey, validateKiroIdpEndpoint, validateKiroRefreshToken, } from './kiro/index.js';
import { antigravityFlow, ANTIGRAVITY_PREEMPT_MS, exchangeAntigravityCode, isAntigravityPermanentRefreshError, refreshAntigravity, } from './antigravity/index.js';
import { importAntigravityAuth, importCodexAuth, importGrokAuth, importGlmAuth, importKiroAuth } from './import-auth.js';
import { buildProviders, catalogProviders, describeCatalog, describeProviders, filterProviders, ModelSwitch, syncHarnessModels, } from './models.js';
import { TokenManager } from './tokens.js';
import { QuotaStore } from './quota.js';
import { fetchLatest, localUpdateInfo, runPluginUpdate, DEFAULT_PROFILE } from '../utils/update.js';
export class AuthController {
    constructor({ authPath, prefix, origin, settings, grokLogin = 'device', onAuthChanged, models, fetchFn = fetch, quotaTtlMs, spawnFn, profile }) {
        this.authPath = authPath;
        this.prefix = prefix;
        this.origin = origin;
        this.settings = settings;
        this.grokLogin = grokLogin;
        this.spawnFn = spawnFn;
        this.profile = profile || DEFAULT_PROFILE;
        this.onAuthChanged = onAuthChanged;
        this.models = models ?? new ModelSwitch();
        this.flows = new OAuthFlowManager();
        this.devices = new DeviceFlowManager();
        this.glmFlows = new GlmCliFlowManager();
        this.kiroFlows = new KiroIdcFlowManager();
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
            glm: new TokenManager({
                displayName: 'GLM (Coding Plan)',
                preemptMs: 24 * 60 * 60_000,
                load: () => getSession('glm', this.authPath),
                save: (session) => saveSession('glm', session, this.authPath),
                remove: () => deleteSession('glm', this.authPath),
                refresh: refreshGlm,
                isPermanent: isGlmPermanentRefreshError,
                onRemoved: () => this.onAuthChanged?.('glm'),
            }),
            kiro: new TokenManager({
                displayName: 'Kiro',
                preemptMs: 2 * 60_000,
                load: () => getSession('kiro', this.authPath),
                save: (session) => saveSession('kiro', session, this.authPath),
                remove: () => deleteSession('kiro', this.authPath),
                refresh: (session) => refreshKiro(session, { fetchFn }),
                isPermanent: isKiroPermanentRefreshError,
                onRemoved: () => this.onAuthChanged?.('kiro'),
            }),
            antigravity: new TokenManager({
                displayName: 'Antigravity',
                preemptMs: ANTIGRAVITY_PREEMPT_MS,
                load: () => getSession('antigravity', this.authPath),
                save: (session) => saveSession('antigravity', session, this.authPath),
                remove: () => deleteSession('antigravity', this.authPath),
                refresh: (session) => refreshAntigravity(session, fetchFn),
                isPermanent: isAntigravityPermanentRefreshError,
                onRemoved: () => this.onAuthChanged?.('antigravity'),
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
            glm: (await getSession('glm', this.authPath)) !== undefined,
            kiro: (await getSession('kiro', this.authPath)) !== undefined,
            antigravity: (await getSession('antigravity', this.authPath)) !== undefined,
        };
    }
    async status(provider) {
        const session = await getSession(provider, this.authPath);
        const detail = this.lastError.get(provider);
        const pub = publicSession(provider, session);
        const activeId = session ? accountIdOf(provider, session) : undefined;
        return {
            loggedIn: session !== undefined,
            busy: this.flows.isBusy(provider) || this.devices.isBusy(provider) || this.glmFlows.isBusy(provider) || this.kiroFlows.isBusy(provider) || this.finalizing.has(provider),
            ...pub,
            quota: this.quota.peek(provider, activeId),
            ...(detail === undefined ? {} : { detail }),
        };
    }
    catalog() {
        return catalogProviders({ prefix: this.prefix, origin: this.origin() });
    }
    async snapshot() {
        await this.models.ready;
        await this.#resolveGlmIdentities();
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
            await this.#ensureAccountQuota('codex');
        else
            this.quota.clear('codex');
        if (loggedIn.grok)
            await this.#ensureAccountQuota('grok');
        else
            this.quota.clear('grok');
        if (loggedIn.glm)
            await this.#ensureAccountQuota('glm');
        else
            this.quota.clear('glm');
        if (loggedIn.kiro)
            await this.#ensureAccountQuota('kiro');
        else
            this.quota.clear('kiro');
        if (loggedIn.antigravity)
            await this.#ensureAccountQuota('antigravity');
        else
            this.quota.clear('antigravity');
        const enabledKeys = this.models.enabledKeys(catalog);
        const [codexAccounts, grokAccounts, glmAccounts, kiroAccounts, antigravityAccounts] = await Promise.all([
            this.#accountsWithQuota('codex'),
            this.#accountsWithQuota('grok'),
            this.#accountsWithQuota('glm'),
            this.#accountsWithQuota('kiro'),
            this.#accountsWithQuota('antigravity'),
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
                glm: { ...(await this.status('glm')), activeId: glmAccounts.find((row) => row.active)?.id, accounts: glmAccounts },
                kiro: { ...(await this.status('kiro')), activeId: kiroAccounts.find((row) => row.active)?.id, accounts: kiroAccounts },
                antigravity: { ...(await this.status('antigravity')), activeId: antigravityAccounts.find((row) => row.active)?.id, accounts: antigravityAccounts },
            },
            update: localUpdateInfo(),
        };
    }
    async refreshQuota(provider, accountId) {
        if (provider === 'codex' || provider === 'grok' || provider === 'glm' || provider === 'kiro' || provider === 'antigravity') {
            const rows = await this.#liveAccounts(provider);
            const targets = accountId
                ? rows.filter((row) => row.id === accountId)
                : rows;
            if (accountId && targets.length === 0)
                throw new Error(`${provider} account ${accountId} is not signed in`);
            if (targets.length === 0)
                return this.quota.peek(provider);
            await Promise.all(targets.map((row) => this.quota.refresh(provider, row.id, row.session)));
            if (accountId)
                return this.quota.peek(provider, accountId);
            const active = rows.find((row) => row.active);
            return this.quota.peek(provider, active?.id);
        }
        const [codex, grok, glm, kiro, antigravity] = await Promise.all([
            this.refreshQuota('codex'),
            this.refreshQuota('grok'),
            this.refreshQuota('glm'),
            this.refreshQuota('kiro'),
            this.refreshQuota('antigravity'),
        ]);
        return { codex, grok, glm, kiro, antigravity };
    }
    async consumeReset(provider, accountId) {
        if (provider !== 'codex')
            throw new Error('only ChatGPT Codex can reset quota');
        const session = await getAccountSession('codex', accountId, this.authPath);
        if (!session)
            throw new Error('ChatGPT Codex is not signed in');
        const live = await this.#hydrateSession('codex', session);
        return this.quota.consume('codex', accountIdOf('codex', live), live);
    }
    async checkUpdate(payload = {}) {
        const apply = payload?.apply === true;
        try {
            const info = await fetchLatest({ fetchFn: this.fetchFn, platform: process.platform });
            if (!apply || info.status !== 'update') {
                return { ...info, apply: { status: 'none' } };
            }
            const result = await runPluginUpdate({
                spawnFn: this.spawnFn,
                profile: this.profile,
            });
            if (result.ok) {
                return { ...info, apply: { status: 'installed', restart: true, command: result.command } };
            }
            return {
                ...info,
                apply: { status: result.status, error: result.error, command: result.command },
            };
        }
        catch (error) {
            return {
                ...localUpdateInfo(),
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                latest: undefined,
                assets: [],
                apply: { status: 'none' },
            };
        }
    }
    async #resolveGlmIdentities() {
        const rows = await listStoredSessions('glm', this.authPath);
        await Promise.all(rows.map(async (row) => {
            if (pickGlmHumanAccount(row.session?.account))
                return;
            const account = await resolveGlmIdentity(row.session, { fetchFn: this.fetchFn }).catch(() => undefined);
            if (!account || account === row.session.account)
                return;
            const next = { ...row.session, account };
            const nextId = accountIdOf('glm', next);
            if (nextId !== row.id) {
                await replaceAccountId('glm', row.id, next, this.authPath);
                this.quota.clear('glm', row.id);
            }
            else {
                await saveSession('glm', next, this.authPath, { activate: false });
            }
        }));
    }
    async #hydrateSession(provider, session) {
        const manager = this.tokens[provider];
        if (!session || !manager)
            return session;
        if (typeof session.expiresAt !== 'number')
            return session;
        if (session.expiresAt - Date.now() > manager.preemptMs)
            return session;
        try {
            const next = await manager.refresh(session);
            await saveSession(provider, next, this.authPath, { activate: false });
            return next;
        }
        catch {
            return session;
        }
    }
    async #liveAccounts(provider) {
        const rows = await listStoredSessions(provider, this.authPath);
        return Promise.all(rows.map(async (row) => ({
            ...row,
            session: await this.#hydrateSession(provider, row.session),
        })));
    }
    async #ensureAccountQuota(provider) {
        const rows = await this.#liveAccounts(provider);
        if (rows.length === 0) {
            this.quota.clear(provider);
            return [];
        }
        await Promise.all(rows.map(async (row) => {
            const quota = await this.quota.ensure(provider, row.id, row.session);
            if (provider === 'kiro')
                await this.#rememberKiroProfile(row, quota);
        }));
        return rows;
    }
    async #rememberKiroProfile(row, quota) {
        if (!quota || quota.status !== 'ready')
            return;
        const email = typeof quota.account === 'string' && quota.account.trim() ? quota.account.trim() : undefined;
        const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined;
        if (!email && !planType)
            return;
        if ((!email || row.session.account === email) && (!planType || row.session.planType === planType))
            return;
        const next = { ...row.session };
        if (email)
            next.account = email;
        if (planType)
            next.planType = planType;
        await saveSession('kiro', next, this.authPath, { id: row.id, activate: row.active });
    }
    async #accountsWithQuota(provider) {
        const rows = await listStoredSessions(provider, this.authPath);
        return rows
            .map((row) => ({
            id: row.id,
            active: row.active,
            ...publicSession(provider, row.session),
            quota: this.quota.peek(provider, row.id),
        }))
            .sort((left, right) => Number(right.active) - Number(left.active) || left.id.localeCompare(right.id));
    }
    async login(provider, options) {
        const payload = typeof options === 'string' || options == null ? { mode: options } : options;
        const mode = payload.mode ?? payload.region;
        if (provider === 'kiro')
            return this.#loginKiro(payload);
        if (provider === 'glm') {
            const region = normalizeGlmRegion(mode);
            const attempt = await this.glmFlows.start('glm', { region, fetchFn: this.fetchFn });
            this.finalizing.add('glm');
            void this.completeGlm(attempt);
            return { authorizeUrl: attempt.authorizeUrl, mode: 'cli', region };
        }
        if (provider === 'antigravity') {
            const attempt = await this.flows.start('antigravity', antigravityFlow);
            const claim = this.claim('antigravity');
            void this.completePkce('antigravity', attempt, claim);
            return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'oauth' };
        }
        if (provider === 'codex') {
            const attempt = await this.flows.start('codex', codexFlow);
            const claim = this.claim('codex');
            void this.completePkce('codex', attempt, claim);
            return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' };
        }
        if (provider !== 'grok')
            throw new Error(`unknown provider ${provider}`);
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
    async #loginKiro(payload = {}) {
        const mode = canonicalizeKiroMethod(payload.mode ?? payload.authMethod, {
            tokenEndpoint: payload.tokenEndpoint,
        });
        if (mode === 'api_key' || mode === 'external_idp') {
            throw new Error('kiro API key and enterprise SSO use the paste form, not browser login');
        }
        this.claim('kiro');
        this.flows.pending('kiro')?.cancel();
        this.kiroFlows.pending('kiro')?.cancel();
        if (mode === 'idc' || payload.mode === 'builder' || payload.mode === 'builder-id') {
            const startUrl = typeof payload.startUrl === 'string' && payload.startUrl.trim()
                ? payload.startUrl.trim()
                : BUILDER_ID_START_URL;
            const kind = startUrl === BUILDER_ID_START_URL ? 'builder' : 'enterprise';
            const attempt = await this.kiroFlows.start('kiro', {
                startUrl,
                kind,
                fetchFn: this.fetchFn,
            });
            this.finalizing.add('kiro');
            void this.completeKiroIdc(attempt);
            return {
                authorizeUrl: attempt.verificationUrl,
                verificationUri: attempt.verificationUri,
                userCode: attempt.userCode,
                mode: 'device',
                kind,
                startUrl,
            };
        }
        const attempt = await this.flows.start('kiro', kiroSocialFlow());
        const claim = this.claim('kiro');
        void this.completePkce('kiro', attempt, claim);
        return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' };
    }
    async completePkce(provider, attempt, claim) {
        try {
            const code = await attempt.waitCode();
            const session = provider === 'codex'
                ? await exchangeCodexCode(code, attempt.pkce.verifier, attempt.redirectUri)
                : provider === 'kiro'
                    ? await exchangeKiroSocialCode(code, attempt.pkce.verifier, attempt.redirectUri, { fetchFn: this.fetchFn })
                    : provider === 'antigravity'
                        ? await exchangeAntigravityCode(code, attempt.redirectUri, { fetchFn: this.fetchFn })
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
    async completeGlm(attempt) {
        try {
            const session = await attempt.waitToken();
            await saveSession('glm', session, this.authPath);
            this.lastError.delete('glm');
            this.onAuthChanged?.('glm');
            void this.quota.refresh('glm');
        }
        catch (error) {
            if (!(error instanceof Error && error.message === 'login cancelled')) {
                this.lastError.set('glm', error instanceof Error ? error.message : String(error));
            }
        }
        finally {
            this.finalizing.delete('glm');
        }
    }
    async completeKiroIdc(attempt) {
        try {
            const session = await attempt.waitToken();
            await saveSession('kiro', session, this.authPath);
            this.lastError.delete('kiro');
            this.onAuthChanged?.('kiro');
            void this.quota.refresh('kiro');
        }
        catch (error) {
            if (!(error instanceof Error && error.message === 'login cancelled')) {
                this.lastError.set('kiro', error instanceof Error ? error.message : String(error));
            }
        }
        finally {
            this.finalizing.delete('kiro');
        }
    }
    async useKey(provider, key, extra) {
        const payload = typeof extra === 'string' || extra == null ? { region: extra } : extra;
        if (provider === 'kiro')
            return this.#useKiroKey(key, payload);
        if (provider !== 'glm')
            throw new Error('only GLM and Kiro accept a pasted key');
        const accessToken = typeof key === 'string' ? key.trim() : '';
        if (accessToken.length < 8)
            throw new Error('glm API key is empty');
        this.claim('glm');
        this.glmFlows.pending('glm')?.cancel();
        const resolved = normalizeGlmRegion(payload.region ?? payload.mode);
        await saveSession('glm', glmSession({
            accessToken,
            account: 'api-key',
            region: resolved,
        }), this.authPath);
        this.lastError.delete('glm');
        this.onAuthChanged?.('glm');
        void this.quota.refresh('glm');
        return { region: resolved };
    }
    async #useKiroKey(key, payload = {}) {
        const raw = typeof key === 'string' ? key.trim() : '';
        const mode = canonicalizeKiroMethod(payload.mode ?? payload.authMethod, {
            tokenEndpoint: payload.tokenEndpoint,
        });
        this.claim('kiro');
        this.flows.pending('kiro')?.cancel();
        this.kiroFlows.pending('kiro')?.cancel();
        let session;
        if (raw.startsWith('ksk_') || mode === 'api_key') {
            const kiroApiKey = validateKiroApiKey(raw || payload.kiroApiKey);
            session = kiroSession({
                accessToken: kiroApiKey,
                kiroApiKey,
                authMethod: 'api_key',
                account: typeof payload.account === 'string' ? payload.account : 'api-key',
            });
        }
        else if (mode === 'external_idp' || payload.tokenEndpoint) {
            const tokenEndpoint = validateKiroIdpEndpoint(payload.tokenEndpoint);
            session = await refreshKiroExternalIdp(kiroSession({
                refreshToken: validateKiroRefreshToken(raw || payload.refreshToken),
                clientId: payload.clientId,
                tokenEndpoint,
                issuerUrl: payload.issuerUrl,
                scopes: payload.scopes,
                authMethod: 'external_idp',
                kiroProvider: 'Entra',
                account: payload.account,
            }), { fetchFn: this.fetchFn });
        }
        else {
            session = await refreshKiroSocial(kiroSession({
                refreshToken: validateKiroRefreshToken(raw),
                authMethod: 'social',
                kiroProvider: 'Social',
                account: payload.account,
            }), { fetchFn: this.fetchFn });
        }
        await saveSession('kiro', session, this.authPath);
        this.lastError.delete('kiro');
        this.onAuthChanged?.('kiro');
        void this.quota.refresh('kiro');
        return { method: session.authMethod, account: publicSession('kiro', session) };
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
        this.glmFlows.pending(provider)?.cancel();
        this.kiroFlows.pending(provider)?.cancel();
    }
    async logout(provider, id) {
        this.claim(provider);
        this.flows.pending(provider)?.cancel();
        this.devices.pending(provider)?.cancel();
        this.glmFlows.pending(provider)?.cancel();
        this.kiroFlows.pending(provider)?.cancel();
        await deleteSession(provider, this.authPath, id);
        this.lastError.delete(provider);
        this.quota.clear(provider, id);
        this.onAuthChanged?.(provider);
        if (await getSession(provider, this.authPath))
            void this.#ensureAccountQuota(provider);
    }
    async switchAccount(provider, id) {
        await switchAccount(provider, id, this.authPath);
        this.lastError.delete(provider);
        this.onAuthChanged?.(provider);
        return this.snapshot();
    }
    async importFrom(provider) {
        const result = provider === 'codex'
            ? await importCodexAuth()
            : provider === 'glm'
                ? await importGlmAuth()
                : provider === 'kiro'
                    ? await importKiroAuth()
                    : provider === 'antigravity'
                        ? await importAntigravityAuth({ fetchFn: this.fetchFn })
                        : await importGrokAuth();
        this.claim(provider);
        this.flows.pending(provider)?.cancel();
        this.devices.pending(provider)?.cancel();
        this.glmFlows.pending(provider)?.cancel();
        this.kiroFlows.pending(provider)?.cancel();
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
        else if (payload.family === 'codex' || payload.family === 'grok' || payload.family === 'glm' || payload.family === 'kiro' || payload.family === 'antigravity') {
            await this.models.setFamily(payload.family, payload.on !== false, catalog);
        }
        else if (typeof payload.all === 'boolean') {
            await this.models.setAll(payload.all, catalog);
        }
        else {
            throw new Error('models payload needs selected, key, family, or all');
        }
        if (this.settings && typeof this.settings.mutate === 'function') {
            // Picker already wrote the switch; do not re-enable a deliberate 全关.
            // Mutate failures must reach the RPC so the picker can show them.
            await this.sync(undefined, { recover: false });
        }
        return this.snapshot();
    }
    async sync(selected, options = {}) {
        if (this.settings === undefined || typeof this.settings.mutate !== 'function') {
            throw new Error('settings service is not mounted; cannot sync llm-pi-ai routes');
        }
        await this.models.ready;
        const catalog = this.catalog();
        if (selected !== undefined) {
            await this.models.setEnabled(selected, catalog);
        }
        const loggedIn = await this.loggedIn();
        if (options.recover !== false && selected === undefined) {
            await this.models.recoverEmptyLoggedInFamilies(catalog, loggedIn);
        }
        return syncHarnessModels({
            settings: this.settings,
            prefix: this.prefix,
            origin: this.origin(),
            loggedIn,
            selected: this.models.selectedForSync(catalog),
        });
    }
}
