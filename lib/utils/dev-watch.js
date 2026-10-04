/**
 * Debounced serial build queue behind `npm run dev` (scripts/dev-watch.ts).
 *
 * The dev loop is: source change → rebuild `lib/` → the two DSH HMR halves
 * pick it up (dsh-hmr reloads the host plugin, dsh-client-hmr swaps
 * `lib/ui/client.js` in open pages). A save and a build each emit bursts —
 * editors fire several events, tsc rewrites dozens of files — so the queue
 * collapses every burst into one run inside a fixed window measured from the
 * FIRST push (a rolling window could starve under continuous writes; a fixed
 * one bounds time-to-build at debounceMs). Runs never overlap: a push during
 * a build only marks the queue dirty and schedules exactly one re-run, so
 * `npm run dev-build` itself is the only writer of `lib/`. A failing run
 * reports through onError and leaves the queue alive — a broken intermediate
 * save must not kill the loop.
 *
 * Pure mechanism, no fs/child_process: tests drive it with injected timers
 * (test/dev-watch.test.ts), the script wires fs.watch + spawn.
 */
export function createBuildQueue(run, options = {}) {
    const debounceMs = options.debounceMs ?? 500;
    const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
    let phase = 'idle';
    let timer;
    let dirty = false;
    let stopped = false;
    let current;
    const settleHooks = (ok, error) => {
        try {
            if (!ok && error !== undefined)
                options.onError?.(error);
        }
        catch {
            // An observer throwing must not break the queue; it already counted as a failed run.
        }
        try {
            options.onDone?.(ok);
        }
        catch { /* same */ }
    };
    const finishRun = () => {
        current = undefined;
        if (stopped) {
            phase = 'idle';
            dirty = false;
            return;
        }
        if (dirty) {
            dirty = false;
            arm();
        }
        else {
            phase = 'idle';
        }
    };
    const arm = () => {
        phase = 'waiting';
        timer = setTimer(() => {
            timer = undefined;
            phase = 'building';
            try {
                options.onStart?.();
            }
            catch { /* observer error is not ours */ }
            // run() starts synchronously with the window firing; a synchronous
            // throw is a failed run, not a broken queue.
            let first;
            try {
                first = Promise.resolve(run());
            }
            catch (error) {
                settleHooks(false, error);
                finishRun();
                return;
            }
            current = first
                .then(() => settleHooks(true), (error) => settleHooks(false, error))
                .finally(finishRun);
        }, debounceMs);
    };
    return {
        push() {
            if (stopped)
                return;
            if (phase === 'building') {
                dirty = true;
                return;
            }
            if (phase === 'waiting')
                return; // fixed window from the first push
            arm();
        },
        waiting: () => phase === 'waiting',
        running: () => phase === 'building',
        stop() {
            stopped = true;
            if (timer !== undefined) {
                clearTimer(timer);
                timer = undefined;
            }
            if (phase === 'building' && current)
                return current.catch(() => { });
            phase = 'idle';
            return Promise.resolve();
        },
    };
}
/**
 * Which profiles run this working tree (symlink → linked) versus an installed
 * copy, and whether each profile's `hmr` entry watches this repo. This is the
 * one manual step of the dev loop, and its failure mode is silent (edits just
 * never hot-reload), so `npm run dev` probes it at startup and after every
 * build. Read-only on purpose: the patch file belongs to DSH, fixing it stays
 * a paste — the watcher prints the exact block with the absolute path filled in.
 * Substring checks are a hint, not a gate: profiles patching `hmr` differently
 * (merged roots, other repos) only get a nudge, never a rewrite.
 */
export function inspectHmrWiring({ root, probe }) {
    const out = [];
    for (const profile of probe.listProfiles()) {
        const real = probe.packageRealPath(profile);
        if (real === undefined)
            continue;
        const patch = probe.readPatch(profile) ?? '';
        const hmrEntryPresent = patch.includes('dsh-hmr');
        out.push({
            profile,
            kind: real === root ? 'linked' : 'copy',
            hmrEntryPresent,
            hmrCoversRepo: hmrEntryPresent && patch.includes(root),
        });
    }
    return out.sort((a, b) => a.profile.localeCompare(b.profile));
}
