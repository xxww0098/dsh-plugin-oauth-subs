/**
 * Persist About-page auto-update checkboxes.
 * Keys are independent: plugin GitHub release vs npm @deepseek-ai/dsh.
 *
 * update-state.json sits beside it and records the last automatic run
 * (time + per-channel outcome) so the About page can show that auto-update
 * is alive — manual clicks never write it.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
export const UPDATE_PREFS_FILE = 'update-prefs.json';
export const UPDATE_STATE_FILE = 'update-state.json';
export const AUTO_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
export function defaultUpdatePrefs() {
    return { plugin: false, dsh: false };
}
export function updatePrefsPath(dataDir) {
    return join(dataDir, UPDATE_PREFS_FILE);
}
export function updateStatePath(dataDir) {
    return join(dataDir, UPDATE_STATE_FILE);
}
export function normalizeUpdatePrefs(raw) {
    return {
        plugin: raw?.plugin === true,
        dsh: raw?.dsh === true,
    };
}
export async function readUpdatePrefs(path) {
    try {
        const text = await readFile(path, 'utf8');
        return normalizeUpdatePrefs(JSON.parse(text));
    }
    catch {
        return defaultUpdatePrefs();
    }
}
export async function writeUpdatePrefs(path, prefs) {
    const next = normalizeUpdatePrefs(prefs);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(next) + '\n', 'utf8');
    return next;
}
const AUTO_RUN_STATUSES = new Set(['installed', 'current', 'update', 'failed', 'unknown']);
function normalizeRunEntry(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const status = AUTO_RUN_STATUSES.has(raw.status) ? raw.status : 'unknown';
    const version = typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : undefined;
    return version ? { status, version } : { status };
}
/**
 * Fold one channel's checkUpdate/checkDshUpdate result into a lastRun entry.
 * 'installed' means the apply landed (a restart follows); 'update' means a
 * newer version exists but nothing was installed (github-only, or apply
 * skipped); 'failed' covers apply failure/timeout/unchanged and check errors.
 */
export function autoRunOutcome(result) {
    const applyStatus = result?.apply?.status;
    if (applyStatus === 'installed') {
        const version = result?.apply?.after || result?.version;
        return { status: 'installed', ...(typeof version === 'string' && version ? { version } : {}) };
    }
    if (applyStatus && applyStatus !== 'none')
        return { status: 'failed' };
    if (result?.status === 'error')
        return { status: 'failed' };
    if (result?.status === 'update' || result?.status === 'github-only') {
        const version = result?.latest?.tag || result?.npm?.version || result?.latestTag?.version;
        return { status: 'update', ...(typeof version === 'string' && version ? { version } : {}) };
    }
    if (result?.status === 'current' || result?.status === 'ahead')
        return { status: 'current' };
    return { status: 'unknown' };
}
export function normalizeUpdateState(raw) {
    const at = typeof raw?.at === 'string' && raw.at.trim() ? raw.at.trim() : undefined;
    const plugin = normalizeRunEntry(raw?.plugin);
    const dsh = normalizeRunEntry(raw?.dsh);
    if (!at && !plugin && !dsh)
        return {};
    return {
        ...(at ? { at } : {}),
        ...(plugin ? { plugin } : {}),
        ...(dsh ? { dsh } : {}),
    };
}
export async function readUpdateState(path) {
    try {
        const text = await readFile(path, 'utf8');
        return normalizeUpdateState(JSON.parse(text));
    }
    catch {
        return {};
    }
}
export async function writeUpdateState(path, state) {
    const next = normalizeUpdateState(state);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(next) + '\n', 'utf8');
    return next;
}
