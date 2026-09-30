/**
 * Kiro account lifecycle for AuthController: live catalog discovery, Social / Builder ID /
 * IdC login, pasted keys and batch imports, and profile write-back.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */
import { listStoredSessions, publicSession, saveSession, updateAccountSession } from '../store.js';
import { allocateKiroMachineId, BUILDER_ID_START_URL, canonicalizeKiroMethod, kiroSession, kiroSocialFlow, refreshKiro, refreshKiroExternalIdp, refreshKiroSocial, validateKiroApiKey, validateKiroIdpEndpoint, validateKiroRefreshToken, } from './index.js';
import { isKiroBatchImport, parseKiroImportText } from './import.js';
import { kiroCatalogModels } from './catalog.js';
export async function discoverKiro(ctl, session) {
    if (!session || typeof ctl.kiroDiscover !== 'function')
        return kiroCatalogModels();
    try {
        return await ctl.kiroDiscover(session);
    }
    catch {
        return kiroCatalogModels();
    }
}
export async function rememberKiroProfile(ctl, row, quota) {
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
    await updateAccountSession('kiro', row, next, ctl.authPath);
}
export async function existingKiroMachineId(ctl) {
    const rows = await listStoredSessions('kiro', ctl.authPath);
    for (const row of rows) {
        const id = row.session?.machineId;
        if (typeof id === 'string' && /^[0-9a-f]{64}$/i.test(id))
            return id;
    }
    return undefined;
}
export async function loginKiro(ctl, payload = {}) {
    const mode = canonicalizeKiroMethod(payload.mode ?? payload.authMethod, {
        tokenEndpoint: payload.tokenEndpoint,
    });
    if (mode === 'api_key' || mode === 'external_idp') {
        throw new Error('kiro API key and enterprise SSO use the paste form, not browser login');
    }
    ctl.claim('kiro');
    ctl.flows.pending('kiro')?.cancel();
    ctl.kiroFlows.pending('kiro')?.cancel();
    if (mode === 'idc' || payload.mode === 'builder' || payload.mode === 'builder-id') {
        const startUrl = typeof payload.startUrl === 'string' && payload.startUrl.trim()
            ? payload.startUrl.trim()
            : BUILDER_ID_START_URL;
        const kind = startUrl === BUILDER_ID_START_URL ? 'builder' : 'enterprise';
        const attempt = await ctl.kiroFlows.start('kiro', {
            startUrl,
            kind,
            fetchFn: ctl.fetchFn,
        });
        ctl.finalizing.add('kiro');
        void ctl.completeKiroIdc(attempt);
        return {
            authorizeUrl: attempt.verificationUrl,
            verificationUri: attempt.verificationUri,
            userCode: attempt.userCode,
            mode: 'device',
            kind,
            startUrl,
        };
    }
    const machineId = allocateKiroMachineId(await existingKiroMachineId(ctl));
    const attempt = await ctl.flows.start('kiro', kiroSocialFlow());
    attempt.machineId = machineId;
    const claim = ctl.claim('kiro');
    void ctl.completePkce('kiro', attempt, claim);
    return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce', machineId };
}
export async function completeKiroIdc(ctl, attempt) {
    try {
        const session = await attempt.waitToken();
        await saveSession('kiro', session, ctl.authPath);
        ctl.lastError.delete('kiro');
        await discoverKiro(ctl, session);
        ctl.onAuthChanged?.('kiro');
        void ctl.quota.refresh('kiro');
    }
    catch (error) {
        if (!(error instanceof Error && error.message === 'login cancelled')) {
            ctl.lastError.set('kiro', error instanceof Error ? error.message : String(error));
        }
    }
    finally {
        ctl.finalizing.delete('kiro');
    }
}
export async function useKiroKey(ctl, key, payload = {}) {
    const raw = typeof key === 'string' ? key.trim() : '';
    const parsed = parseKiroImportText(raw);
    if (isKiroBatchImport(parsed.kind) && parsed.sessions.length > 0) {
        return saveKiroImports(ctl, parsed.sessions, { refreshMissingAccess: true });
    }
    const mode = canonicalizeKiroMethod(payload.mode ?? payload.authMethod, {
        tokenEndpoint: payload.tokenEndpoint,
    });
    ctl.claim('kiro');
    ctl.flows.pending('kiro')?.cancel();
    ctl.kiroFlows.pending('kiro')?.cancel();
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
        }), { fetchFn: ctl.fetchFn });
    }
    else {
        session = await refreshKiroSocial(kiroSession({
            refreshToken: validateKiroRefreshToken(raw),
            authMethod: 'social',
            kiroProvider: 'Social',
            account: payload.account,
        }), { fetchFn: ctl.fetchFn });
    }
    await saveSession('kiro', session, ctl.authPath);
    ctl.lastError.delete('kiro');
    await discoverKiro(ctl, session);
    ctl.onAuthChanged?.('kiro');
    void ctl.quota.refresh('kiro');
    return { method: session.authMethod, account: publicSession('kiro', session), count: 1 };
}
export async function saveKiroImports(ctl, sessions, { refreshMissingAccess = false } = {}) {
    ctl.claim('kiro');
    ctl.flows.pending('kiro')?.cancel();
    ctl.kiroFlows.pending('kiro')?.cancel();
    const saved = [];
    const errors = [];
    for (const draft of sessions) {
        let session = draft;
        const method = canonicalizeKiroMethod(session.authMethod, { tokenEndpoint: session.tokenEndpoint });
        const needsRefresh = refreshMissingAccess
            && method !== 'api_key'
            && (!session.accessToken || session.accessToken === session.refreshToken);
        try {
            if (needsRefresh)
                session = await refreshKiro(session, { fetchFn: ctl.fetchFn });
            await saveSession('kiro', session, ctl.authPath, { activate: saved.length === 0 });
            saved.push(session);
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }
    if (saved.length === 0) {
        throw new Error(errors[0] || 'no Kiro credentials imported');
    }
    ctl.lastError.delete('kiro');
    if (saved[0])
        await discoverKiro(ctl, saved[0]);
    ctl.onAuthChanged?.('kiro');
    void ctl.quota.refresh('kiro');
    return {
        method: saved[0]?.authMethod,
        account: publicSession('kiro', saved[0]),
        count: saved.length,
    };
}
