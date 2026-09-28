import { readFile } from 'node:fs/promises';
const DONATE_FILES = {
    wechat: 'wechat.jpg',
    alipay: 'alipay.jpg',
};
let cached;
/**
 * Payment QR codes shipped in the package under assets/donate/. Read once and
 * handed to the workbench as data URIs — the client bundle is a classic
 * script with no static-file channel of its own. A file missing from a
 * trimmed install just drops that entry.
 */
export function donateQr() {
    cached ??= (async () => {
        const out = {};
        await Promise.all(Object.entries(DONATE_FILES).map(async ([key, file]) => {
            try {
                const body = await readFile(new URL(`../../assets/donate/${file}`, import.meta.url));
                out[key] = `data:image/jpeg;base64,${body.toString('base64')}`;
            }
            catch { /* asset not shipped in this install */ }
        }));
        return out;
    })();
    return cached;
}
