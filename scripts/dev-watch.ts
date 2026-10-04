/**
 * `npm run dev`: watch the sources and rebuild into `lib/` on every change,
 * so both DSH HMR halves pick the new code up without a manual
 * `npm run dev-build` — dsh-hmr reloads the host plugin, dsh-client-hmr swaps
 * `lib/ui/client.js` in open pages.
 *
 * At startup, and again after every build (printed only when the answer
 * changes), it probes the HMR wiring: which dsh profiles run this working tree
 * (link) and whether each profile's `hmr` entry watches this repo. That is
 * the one manual step of the dev loop and its failure mode is silent — edits
 * just never hot-reload. Missing wiring is printed as a paste-ready block with
 * the absolute path filled in; the patch file itself is never written to.
 *
 * Watched: src/ and scripts/ (recursive), package.json, tsconfig*.json (via a
 * non-recursive root watch, so editor atomic-save inode swaps cannot break
 * it). Never watched: lib/, node_modules/ — the build writes lib/, watching it
 * would be a feedback loop. Dotfiles are ignored (.DS_Store and friends).
 */

import { readdirSync, readFileSync, realpathSync, statSync, watch } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuildQueue, inspectHmrWiring } from '../lib/utils/dev-watch.js'
import { dshHome } from '../lib/utils/update.js'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const WATCH_DIRS = ['src', 'scripts']
const WATCH_FILES = ['package.json', 'tsconfig.json', 'tsconfig.ui.json']
const DEBOUNCE_MS = 500

let buildStartedAt = 0
let building = false
let lastWiring = ''

const profilesDir = join(dshHome(), 'profiles')
const patchPathOf = (profile: string) => join(profilesDir, profile, 'cordis.patch.yml')
const probe = {
  listProfiles: () => {
    try {
      return readdirSync(profilesDir).filter((name) => {
        try {
          return statSync(join(profilesDir, name)).isDirectory()
        } catch {
          return false
        }
      })
    } catch {
      return [] // no ~/.dsh yet — nothing is linked
    }
  },
  packageRealPath: (profile: string) => {
    try {
      return realpathSync(join(profilesDir, profile, 'node_modules', 'dsh-plugin-oauth-subs'))
    } catch {
      return undefined
    }
  },
  readPatch: (profile: string) => {
    try {
      return readFileSync(patchPathOf(profile), 'utf8')
    } catch {
      return undefined
    }
  },
}

const hmrEntryBlock = (rootReal: string) => [
  '- id: hmr',
  '  name: "@deepseek-ai/dsh-hmr"',
  '  config:',
  '    root:',
  '      - ' + rootReal,
].join('\n')

const wiringReport = () => {
  let rootReal = root
  try {
    rootReal = realpathSync(root)
  } catch { /* keep the literal path */ }
  const statuses = inspectHmrWiring({ root: rootReal, probe })
  if (statuses.length === 0) {
    return ['[dev] no dsh profile installs this package — 插件面板 → 添加插件 → 本地插件目录 选本仓库后热重载才生效'].join('\n')
  }
  const lines: string[] = []
  for (const status of statuses) {
    if (status.kind === 'copy') {
      lines.push('[dev] ' + status.profile + ': installed copy（非本工作树的链接），这里的改动到不了它')
      continue
    }
    if (status.hmrCoversRepo) {
      lines.push('[dev] ' + status.profile + ': linked + hmr 监听本仓库 — 两半都会热重载')
      continue
    }
    if (status.hmrEntryPresent) {
      lines.push('[dev] ' + status.profile + ': linked，但它的 hmr 条目没监听本仓库 — 宿主半不会热重载。')
      lines.push('[dev]   把 ' + rootReal + ' 加进该条目的 config.root 列表：' + patchPathOf(status.profile))
      continue
    }
    lines.push('[dev] ' + status.profile + ': linked，但缺 hmr 条目 — 宿主半不会热重载。把下面几行加进 ' + patchPathOf(status.profile) + '（保存即生效，无需重启）：')
    lines.push(hmrEntryBlock(rootReal))
  }
  return lines.join('\n')
}

const announceWiring = (force = false) => {
  const report = wiringReport()
  if (force || report !== lastWiring) {
    console.log(report)
    lastWiring = report
  }
}

const queue = createBuildQueue(() => new Promise<void>((resolve, reject) => {
  const child = spawn('npm', ['run', 'dev-build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  child.once('error', (error) => reject(error instanceof Error ? error : new Error(String(error))))
  child.once('exit', (code) => {
    if (code === 0) resolve()
    else reject(new Error(`dev-build exited with code ${code}`))
  })
}), {
  debounceMs: DEBOUNCE_MS,
  onStart: () => {
    building = true
    buildStartedAt = Date.now()
    console.log('[dev] build started')
  },
  onDone: (ok) => {
    building = false
    const seconds = ((Date.now() - buildStartedAt) / 1000).toFixed(1)
    console.log(ok
      ? `[dev] build ok in ${seconds}s — dsh-hmr reloads the host half, dsh-client-hmr swaps the UI half`
      : `[dev] build failed in ${seconds}s — fix and save; the loop keeps watching`)
    announceWiring()
  },
  onError: (error) => {
    console.error(`[dev] build could not run: ${error instanceof Error ? error.message : error}`)
  },
})

const watchers: Array<{ close(): void }> = []

const changed = (label: string) => {
  if (!building) console.log(`[dev] change: ${label}`)
  queue.push()
}

for (const dir of WATCH_DIRS) {
  watchers.push(watch(join(root, dir), { recursive: true }, (_event, filename) => {
    const name = String(filename ?? '').replace(/\\/g, '/')
    if (!name || name.split('/').pop()!.startsWith('.')) return
    changed(`${dir}/${name}`)
    if (name === 'dev-watch.ts') {
      console.log('[dev] the watcher itself changed — restart `npm run dev` to pick that up')
    }
  }))
}

// Root-level files via the parent directory: an editor's atomic save
// (write temp + rename) swaps the inode, which a direct file watch can miss.
watchers.push(watch(root, (_event, filename) => {
  const name = String(filename ?? '')
  if (WATCH_FILES.includes(name)) changed(name)
}))

console.log(`[dev] watching ${WATCH_DIRS.map((d) => `${d}/`).join(' ')} and ${WATCH_FILES.join(', ')} in ${root}`)
announceWiring(true)
console.log('[dev] building once now')
queue.push()

process.on('SIGINT', () => {
  console.log('\n[dev] stopping')
  for (const watcher of watchers) watcher.close()
  void queue.stop().then(() => process.exit(0))
})
