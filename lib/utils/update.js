/**
 * Local version + GitHub latest-release check, then the host plugin updater.
 *
 * Compare is GitHub latest vs package.json. Apply is
 * `dsh plugin --profile <web> update dsh-plugin-oauth-subs` — the same
 * pnpm-forward DSH CLI as `dsh plugin add`, not a GitHub zip. A generic
 * zip is not a download row. After a successful apply the running process
 * still has the old module; the user must restart `dsh web`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const pkg = require('../../package.json');
export const REPO_SLUG = 'xxww0098/dsh-plugin-oauth-subs';
export const REPO_URL = 'https://github.com/xxww0098/dsh-plugin-oauth-subs';
export const RELEASES_API = `https://api.github.com/repos/${REPO_SLUG}/releases/latest`;
export const PLATFORMS = Object.freeze(['win', 'mac', 'linux']);
export const PLUGIN_NAME = 'dsh-plugin-oauth-subs';
export const DEFAULT_PROFILE = 'web';
export const DSH_BIN = 'dsh';
export const PLUGIN_UPDATE_TIMEOUT_MS = 180_000;
export function installedVersion() {
    return String(pkg.version ?? '');
}
export function parseVersion(tag) {
    const match = String(tag ?? '').trim().match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match)
        return undefined;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: `${match[1]}.${match[2]}.${match[3]}` };
}
export function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b)
        return 0;
    if (a.major !== b.major)
        return a.major - b.major;
    if (a.minor !== b.minor)
        return a.minor - b.minor;
    return a.patch - b.patch;
}
export function hostPlatform(platform = process.platform) {
    if (platform === 'win32')
        return 'win';
    if (platform === 'darwin')
        return 'mac';
    return 'linux';
}
export function classifyAsset(name) {
    const n = String(name ?? '').toLowerCase();
    if (/(windows|win32|win64|\bwin\b)/.test(n))
        return 'win';
    if (/(darwin|macos|\bmac\b|\bosx\b)/.test(n))
        return 'mac';
    if (/(linux|gnu)/.test(n))
        return 'linux';
    return 'any';
}
export function pickDownloads(assets, host) {
    const named = { win: undefined, mac: undefined, linux: undefined };
    for (const asset of Array.isArray(assets) ? assets : []) {
        const name = asset?.name;
        const url = asset?.browser_download_url || asset?.url;
        if (typeof name !== 'string' || typeof url !== 'string' || !url)
            continue;
        const kind = classifyAsset(name);
        if (kind === 'any' || named[kind])
            continue;
        named[kind] = { name, url, size: Number.isFinite(asset.size) ? asset.size : undefined };
    }
    return PLATFORMS.flatMap((platform) => {
        const hit = named[platform];
        if (!hit)
            return [];
        return [{
                platform,
                current: platform === host,
                name: hit.name,
                url: hit.url,
                size: hit.size,
            }];
    });
}
export function localUpdateInfo(platform = process.platform) {
    return {
        version: installedVersion(),
        platform: hostPlatform(platform),
        repo: REPO_URL,
        repoSlug: REPO_SLUG,
    };
}
/** GitHub `published_at` as `YYYY-MM-DD HH:mm:ss` in Asia/Shanghai. */
export function formatPublishedAt(iso) {
    if (typeof iso !== 'string' || !iso.trim())
        return undefined;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return iso.trim();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const pick = (type) => parts.find((part) => part.type === type)?.value || '';
    const hour = pick('hour') === '24' ? '00' : pick('hour');
    return `${pick('year')}-${pick('month')}-${pick('day')} ${hour}:${pick('minute')}:${pick('second')}`;
}
export async function fetchLatest({ fetchFn = fetch, current, platform = process.platform, timeoutMs = 10_000 } = {}) {
    const local = localUpdateInfo(platform);
    const installed = parseVersion(current ?? local.version)?.raw ?? local.version;
    const wait = new AbortController();
    const timer = setTimeout(() => wait.abort(), timeoutMs);
    try {
        const response = await fetchFn(RELEASES_API, {
            headers: {
                accept: 'application/vnd.github+json',
                'user-agent': `dsh-plugin-oauth-subs/${installed || 'dev'}`,
            },
            signal: wait.signal,
        });
        if (!response.ok)
            throw new Error(`GitHub releases ${response.status}`);
        const payload = await response.json();
        const tag = payload?.tag_name || payload?.name;
        const latest = parseVersion(tag);
        const cmp = latest ? compareVersions(latest.raw, installed) : 0;
        const status = !latest ? 'unknown' : cmp > 0 ? 'update' : cmp < 0 ? 'ahead' : 'current';
        const html = typeof payload?.html_url === 'string' ? payload.html_url : `${REPO_URL}/releases/latest`;
        return {
            ...local,
            version: installed,
            status,
            latest: {
                tag: typeof tag === 'string' ? tag : undefined,
                name: typeof payload?.name === 'string' ? payload.name : undefined,
                url: html,
                publishedAt: formatPublishedAt(payload?.published_at),
            },
            assets: pickDownloads(payload?.assets, local.platform),
        };
    }
    finally {
        clearTimeout(timer);
    }
}
/** `$DSH_HOME/profiles/<name>` from Cordis `ctx.baseUrl`, else web. */
export function profileFromBaseUrl(baseUrl) {
    if (typeof baseUrl !== 'string' || !baseUrl.startsWith('file:'))
        return DEFAULT_PROFILE;
    try {
        const path = fileURLToPath(baseUrl).replace(/\\/g, '/');
        const parts = path.split('/').filter(Boolean);
        const i = parts.lastIndexOf('profiles');
        if (i >= 0 && parts[i + 1])
            return parts[i + 1];
    }
    catch {
        // not a file URL we can parse
    }
    return DEFAULT_PROFILE;
}
export function pluginUpdateArgs(profile = DEFAULT_PROFILE) {
    return ['plugin', '--profile', String(profile || DEFAULT_PROFILE), 'update', PLUGIN_NAME];
}
export function pluginUpdateCommand(profile = DEFAULT_PROFILE) {
    return [DSH_BIN, ...pluginUpdateArgs(profile)].join(' ');
}
function dshHome(env = process.env) {
    const home = env.DSH_HOME;
    if (typeof home === 'string' && home.trim())
        return home.trim();
    return join(homedir(), '.dsh');
}
function clip(text) {
    const raw = String(text ?? '').trim().replace(/\s+/g, ' ');
    return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
}
function describeSpawnError(error) {
    if (error?.code === 'ENOENT') {
        return 'dsh was not found on PATH. Confirm DeepSeek Harness is installed, then try again.';
    }
    return error instanceof Error ? error.message : String(error);
}
/**
 * Spawn PATH `dsh` with the profile plugin updater. Does not install
 * `@deepseek-ai/dsh` and does not kill the running profile.
 */
export function runPluginUpdate({ spawnFn = spawn, profile = DEFAULT_PROFILE, timeoutMs = PLUGIN_UPDATE_TIMEOUT_MS, env = process.env, } = {}) {
    const args = pluginUpdateArgs(profile);
    const command = pluginUpdateCommand(profile);
    const home = dshHome(env);
    const cwd = existsSync(home) ? home : undefined;
    return new Promise((resolve) => {
        let child;
        try {
            child = spawnFn(DSH_BIN, args, {
                env,
                ...(cwd ? { cwd } : {}),
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        }
        catch (error) {
            resolve({ ok: false, status: error?.code === 'ENOENT' ? 'missing-dsh' : 'failed', command, error: describeSpawnError(error) });
            return;
        }
        let stdout = '';
        let stderr = '';
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };
        const timer = setTimeout(() => {
            try {
                child.kill('SIGTERM');
            }
            catch { /* already gone */ }
            finish({ ok: false, status: 'timeout', command, error: `dsh plugin update timed out after ${timeoutMs}ms` });
        }, timeoutMs);
        child.stdout?.on?.('data', (chunk) => { stdout += chunk; });
        child.stderr?.on?.('data', (chunk) => { stderr += chunk; });
        child.once('error', (error) => {
            finish({
                ok: false,
                status: error?.code === 'ENOENT' ? 'missing-dsh' : 'failed',
                command,
                error: describeSpawnError(error),
            });
        });
        child.once('close', (code) => {
            if (code === 0) {
                finish({ ok: true, status: 'installed', command });
                return;
            }
            const detail = clip(stderr) || clip(stdout) || `dsh plugin update exited ${code}`;
            finish({ ok: false, status: 'failed', command, error: detail });
        });
    });
}
