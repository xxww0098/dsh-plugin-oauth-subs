/**
 * Plugin self-update for AuthController: version check + install, the
 * persisted auto-update switch, and its hourly background pass.
 */
import { fetchLatest, fetchRecentReleases, localUpdateInfo } from '../utils/update.js';
import { AUTO_UPDATE_INTERVAL_MS, writeUpdatePrefs, writeUpdateState } from '../utils/update-prefs.js';
/**
 * Version check + self-install. `apply` downloads the latest tag tarball and
 * swaps the installed package dirs in place — the profile layout is the same
 * on desktop and web, so this never needs `dsh`/`npm`. The new copy loads on
 * the next host start (`apply.restart` says which restart to ask for). If no
 * installed dir exists the apply degrades to a `manual` command hint.
 */
/** Last few published release notes for the About changelog dialog. */
export async function fetchChangelog(ctl) {
    const releases = await fetchRecentReleases({
        fetchFn: ctl.fetchFn,
        env: ctl.updateEnv ?? process.env,
    });
    return { releases };
}
export async function checkUpdate(ctl, payload = {}) {
    const apply = payload?.apply === true;
    const profileOpts = {
        profile: ctl.profile,
        env: ctl.updateEnv ?? process.env,
        readFileFn: ctl.readFileFn,
    };
    try {
        const info = await fetchLatest({ fetchFn: ctl.fetchFn, platform: process.platform, ...profileOpts });
        if (!apply || info.status !== 'update') {
            return { ...info, apply: { status: 'none' } };
        }
        const result = await ctl.installReleaseFn({
            tag: info.latest?.tag,
            profile: ctl.profile,
            env: ctl.updateEnv ?? process.env,
            fetchFn: ctl.fetchFn,
            readFileFn: ctl.readFileFn,
        });
        return { ...info, apply: result };
    }
    catch (error) {
        return {
            ...localUpdateInfo(process.platform, profileOpts),
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            latest: undefined,
            assets: [],
            apply: { status: 'none' },
        };
    }
}
/** Persist the auto-update switch; turning it on runs one pass now. */
export async function setAutoUpdate(ctl, payload = {}) {
    await ctl.prefsReady;
    ctl.autoUpdate = payload?.autoUpdate === true;
    await writeUpdatePrefs(ctl.prefsFile, { autoUpdate: ctl.autoUpdate });
    if (ctl.autoUpdate)
        void ctl.runAutoUpdate().catch(() => undefined);
    return { autoUpdate: ctl.autoUpdate };
}
/**
 * One auto-update pass: check the latest tag and self-install it when newer.
 * The outcome lands in update-state.json so About can show what the
 * background loop last did.
 */
export async function runAutoUpdate(ctl) {
    await ctl.prefsReady;
    if (!ctl.autoUpdate)
        return { skipped: true };
    const result = await ctl.checkUpdate({ apply: true }).catch((error) => ({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
    }));
    ctl.updateState = {
        at: new Date().toISOString(),
        status: result?.apply?.status && result.apply.status !== 'none' ? result.apply.status : result?.status,
        version: result?.version,
        latest: result?.latest?.tag,
        error: result?.apply?.error || result?.error,
    };
    await writeUpdateState(ctl.stateFile, ctl.updateState).catch(() => undefined);
    return result;
}
export function startAutoUpdateWatch(ctl, { intervalMs = AUTO_UPDATE_INTERVAL_MS } = {}) {
    if (ctl.autoUpdateTimer)
        return;
    void ctl.runAutoUpdate();
    ctl.autoUpdateTimer = setInterval(() => void ctl.runAutoUpdate(), intervalMs);
    ctl.autoUpdateTimer.unref?.();
}
export function stopAutoUpdateWatch(ctl) {
    if (!ctl.autoUpdateTimer)
        return;
    clearInterval(ctl.autoUpdateTimer);
    ctl.autoUpdateTimer = undefined;
}
