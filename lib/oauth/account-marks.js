/**
 * Per-account bookkeeping outside the credential store: the signed-out list
 * that keeps auto-import from reviving a family the user left, and the
 * identity-lookup throttle for the snapshot poll.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writePrivateText } from '../utils/private-text.js';
// Auto-import restores an empty family from local CLI/IDE credentials on
// every start (and every hot reload). A family the user signed out of must
// stay signed out; an explicit import or login still works.
//
// The mark is "the user left this family and has not come back": it is set
// only when the LAST account of a family goes (a partial logout leaves the
// family signed in), and `saveSession` clears it the moment any login lands
// (store.ts calls `clearSignedOutMark`). It is path-based — not tied to a
// controller — so the store can clear it without importing the controller.
export function signedOutPath(authPath) {
    return join(dirname(authPath), 'signed-out.json');
}
export function signedOutFile(ctl) {
    return signedOutPath(ctl.authPath);
}
// Read-modify-write of one small file: concurrent logouts / logins must not
// lose each other's change, so every edit runs through one chain per file.
const chains = new Map();
function serialized(file, task) {
    const next = (chains.get(file) ?? Promise.resolve()).then(task, task);
    const settled = next.then(() => undefined, () => undefined);
    chains.set(file, settled);
    void settled.then(() => { if (chains.get(file) === settled)
        chains.delete(file); });
    return next;
}
async function readMarks(file) {
    try {
        const list = JSON.parse(await readFile(file, 'utf8'));
        return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
    }
    catch {
        return [];
    }
}
export async function signedOut(ctl) {
    return readMarks(signedOutFile(ctl));
}
export async function signedOutOf(ctl, provider) {
    return (await signedOut(ctl)).includes(provider);
}
export function markSignedOut(ctl, provider) {
    const file = signedOutFile(ctl);
    return serialized(file, async () => {
        const list = await readMarks(file);
        if (list.includes(provider))
            return;
        await writePrivateText(file, `${JSON.stringify([...list, provider])}\n`);
    });
}
/** A login landed: the family is signed in again, so auto-import may run again. */
export function clearSignedOutMark(authPath, provider) {
    const file = signedOutPath(authPath);
    return serialized(file, async () => {
        const list = await readMarks(file);
        if (!list.includes(provider))
            return;
        await writePrivateText(file, `${JSON.stringify(list.filter((id) => id !== provider))}\n`);
    });
}
/**
 * Rows still missing a readable identity, minus those tried within the
 * passive quota TTL — the snapshot poll must not re-hit userinfo / state.vscdb
 * every tick. `onAuthChanged` clears the table.
 */
export function identityDue(ctl, provider, rows, hasIdentity) {
    const now = Date.now();
    return rows.filter((row) => {
        if (hasIdentity(row.session?.account))
            return false;
        const key = `${provider}\0${row.id}`;
        const last = ctl.identityTried.get(key);
        if (last !== undefined && now - last < ctl.quota.ttlMs)
            return false;
        ctl.identityTried.set(key, now);
        return true;
    });
}
