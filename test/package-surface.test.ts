import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { parseVersion } from '../lib/utils/update.js'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const exists = (relative) => existsSync(new URL('../' + relative, import.meta.url))

// The plugin panel installs from a registry name, a git repository, or a local
// directory; all three read this manifest before pnpm runs. A missing bundle
// patch, entry point, or published file turns into "该路径不存在或不是有效的插件包".

test('the manifest declares the DSH bundle patch and client the panel installs', () => {
  assert.equal(manifest.name, 'dsh-plugin-oauth-subs')
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.ok(exists('cordis.patch.yml'))
  assert.equal(manifest.dsh?.client?.platform, 'web')
  assert.ok(Array.isArray(manifest.dsh?.client?.inject) && manifest.dsh.client.inject.length > 0)
  assert.ok(Array.isArray(manifest.dsh?.client?.external))
})

test('every published file exists and the install entry points resolve', () => {
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0)
  for (const entry of manifest.files) {
    assert.ok(exists(entry), 'files entry missing from the repo: ' + entry)
  }
  assert.equal(manifest.main, 'lib/index.js')
  assert.equal(manifest.exports?.['.'], './lib/index.js')
  assert.equal(manifest.exports?.['./client'], './lib/ui/client.js')
  assert.ok(exists('lib/index.js'), 'run npm run build before packing: lib/index.js')
  assert.ok(exists('lib/ui/client.js'), 'run npm run build before packing: lib/ui/client.js')
})

test('a git or npm install needs no build step: lib/ is committed', () => {
  // pnpm fetches the repository/tarball as-is; only a local directory link
  // points at a tree the maintainer builds in place.
  assert.ok(exists('src/index.ts'))
  assert.ok(exists('lib/index.js'))
  assert.ok(manifest.scripts?.build, 'build script must exist for the maintainer')
})

test('the committed version is a release version, never a local test number', () => {
  const parsed = parseVersion(manifest.version)
  assert.ok(parsed, 'package.json version must be semver-ish: ' + manifest.version)
  assert.equal(parsed.prerelease, '',
    'the repo manifest keeps the release version; test numbers live in the packed tgz only')
})

test('the DSH peer the panel checks before installing is declared', () => {
  assert.equal(manifest.peerDependencies?.['@deepseek-ai/cordis'], '^4.0.1')
})
