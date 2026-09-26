import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installRelease, installedPackageDirs } from '../lib/utils/update.js'

async function fixture(shared = false) {
  const home = await mkdtemp(join(tmpdir(), 'oauth-installer-'))
  const dir = join(home, 'profiles', 'desktop', 'node_modules', 'dsh-plugin-oauth-subs')
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '0.0.103' }))
  await writeFile(join(dir, 'lib', 'old'), 'complete old copy')
  let other
  if (shared) {
    other = join(home, 'profiles', 'node_modules', 'dsh-plugin-oauth-subs')
    await mkdir(other, { recursive: true })
    await writeFile(join(other, 'package.json'), JSON.stringify({ version: '0.0.102' }))
  }
  return { home, dir, other }
}

async function extract(_archive, dest) {
  const root = join(dest, 'source-root')
  await mkdir(join(root, 'lib'), { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.0.104' }))
  await writeFile(join(root, 'lib', 'index.js'), '// release')
}

function options(home, overrides = {}) {
  return {
    tag: 'v0.0.104', profile: 'desktop', env: { DSH_HOME: home },
    fetchFn: async () => new Response(Buffer.from('tarball')),
    extractFn: extract,
    ...overrides,
  }
}

test('missing profile cannot resolve the source checkout as an install target', async () => {
  const home = await mkdtemp(join(tmpdir(), 'oauth-absent-'))
  assert.deepEqual(installedPackageDirs('desktop', { DSH_HOME: home }), [])
  const result = await installRelease(options(home, { fetchFn: () => { throw new Error('must not fetch') } }))
  assert.equal(result.status, 'manual')
})

test('partial copy leaves the old plugin complete and removes staging', async () => {
  const { home, dir } = await fixture()
  const result = await installRelease(options(home, {
    cpFn: async (_src, next) => {
      await mkdir(join(next, 'lib'), { recursive: true })
      await writeFile(join(next, 'lib', 'partial'), 'not a complete release')
      throw new Error('copy interrupted')
    },
  }))
  assert.equal(result.status, 'failed')
  assert.match(result.error, /copy interrupted/)
  assert.equal(JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version, '0.0.103')
  assert.equal(existsSync(join(dir, 'lib', 'old')), true)
  assert.equal(existsSync(dir + '.oauth-subs-bak'), false)
})

test('failure staging the second copy leaves both installed copies intact', async () => {
  const { home, dir, other } = await fixture(true)
  let copies = 0
  const result = await installRelease(options(home, {
    cpFn: async (...args) => {
      if (++copies === 2) throw new Error('second stage failed')
      return cp(...args)
    },
  }))
  assert.equal(result.status, 'failed')
  assert.equal(JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version, '0.0.103')
  assert.equal(JSON.parse(await readFile(join(other, 'package.json'), 'utf8')).version, '0.0.102')
})

test('failure swapping the second copy restores the first copy', async () => {
  const { home, dir, other } = await fixture(true)
  const result = await installRelease(options(home, {
    renameFn: async (from, to) => {
      if (from.startsWith(other + '.oauth-subs-next-') && to === other) throw new Error('second swap failed')
      return rename(from, to)
    },
  }))
  assert.equal(result.status, 'failed')
  assert.equal(JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version, '0.0.103')
  assert.equal(JSON.parse(await readFile(join(other, 'package.json'), 'utf8')).version, '0.0.102')
  assert.equal(existsSync(dir + '.oauth-subs-bak'), false)
  assert.equal(existsSync(other + '.oauth-subs-bak'), false)
})

test('previous backup is preserved rather than deleted by a new install', async () => {
  const { home, dir } = await fixture()
  await mkdir(dir + '.oauth-subs-bak')
  await writeFile(join(dir + '.oauth-subs-bak', 'old'), 'last complete backup')
  const result = await installRelease(options(home))
  assert.equal(result.status, 'failed')
  assert.match(result.error, /Previous update backup/)
  assert.equal(await readFile(join(dir + '.oauth-subs-bak', 'old'), 'utf8'), 'last complete backup')
})

test('simultaneous installs serialize when sharing the same target', async () => {
  const { home, dir } = await fixture()
  let active = 0
  let peak = 0
  const extractFn = async (...args) => {
    active++
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 15))
    await extract(...args)
    active--
  }
  const results = await Promise.all([
    installRelease(options(home, { extractFn })),
    installRelease(options(home, { extractFn })),
  ])
  assert.deepEqual(results.map((row) => row.status), ['installed', 'installed'])
  assert.equal(peak, 1)
  assert.equal(JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version, '0.0.104')
})
