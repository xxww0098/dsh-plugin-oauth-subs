/**
 * Assemble the Settings UI classic script. `src/ui/client.ts` is the
 * `__ModuleLoader__.load` factory shell; each `//@part <name>` marker line in
 * it is replaced by the body of `src/ui/parts/<name>.ts`, so every part shares
 * the one factory closure (`h`, hooks, `COPY`, …) and the host still gets a
 * single `lib/ui/client.js`. The assembled source is written to
 * `.ui-build/client.ts`, which `tsconfig.ui.json` type-checks and compiles.
 *
 * A part file opens with column-0 `//` lines and one blank line; that header
 * is dropped, the rest is inserted verbatim (parts keep the factory's indent).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARKER = /^ {4}\/\/@part ([a-z][a-z0-9-]*)$/gm

function partBody(text: string, name: string) {
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && lines[i].startsWith('//')) i++
  if (lines[i] !== '') throw new Error(`src/ui/parts/${name}.ts: header must end with one blank line`)
  return lines.slice(i + 1).join('\n').replace(/\n$/, '')
}

/** The assembled Settings UI source; tests read this instead of the shell file. */
export function assembleUi(root = ROOT) {
  const shell = readFileSync(join(root, 'src/ui/client.ts'), 'utf8')
  const seen = new Set<string>()
  return shell.replace(MARKER, (_, name) => {
    if (seen.has(name)) throw new Error(`src/ui/client.ts: part ${name} is included twice`)
    seen.add(name)
    return partBody(readFileSync(join(root, 'src/ui/parts', `${name}.ts`), 'utf8'), name)
  })
}

export function writeUiBuild(root = ROOT) {
  const out = join(root, '.ui-build', 'client.ts')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, assembleUi(root))
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeUiBuild()
