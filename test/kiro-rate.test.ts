import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { kiroSession } from '../lib/oauth/kiro/index.js'
import { refreshKiroCatalog, resetKiroCatalogCache } from '../lib/oauth/kiro/catalog.js'
import { buildProviders, catalogProviders, describeCatalog } from '../lib/oauth/models.js'

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

async function liveRows() {
  resetKiroCatalogCache()
  const rows = await refreshKiroCatalog(kiroSession({ accessToken: 'rate-tok', authMethod: 'social' }), {
    fetchFn: async () => json({ models: [
      { modelId: 'gpt-5.6-sol', modelName: 'GPT 5.6 Sol', rateMultiplier: 4.4, rateUnit: 'Credit' },
      { modelId: 'qwen3-coder-next', modelName: 'Qwen3 Coder Next', rateMultiplier: 0.05, rateUnit: 'Credit' },
      { modelId: 'deepseek-3.2', modelName: 'Deepseek v3.2' },
    ] }),
  })
  resetKiroCatalogCache()
  return rows
}

test('the live list\'s rateMultiplier rides on the catalog row, and is absent when the list gives none', async () => {
  const rows = await liveRows()
  const rate = (id) => rows.find((row) => row.id === id)?.rate
  assert.equal(rate('gpt-5.6-sol'), 4.4)
  assert.equal(rate('qwen3-coder-next'), 0.05)
  assert.equal('rate' in rows.find((row) => row.id === 'deepseek-3.2'), false)
})

test('the Models page gets the rate; the route rows written to settings never do', async () => {
  const rows = await liveRows()
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', kiroModels: rows })
  const rates = { 'kiro/gpt-5.6-sol': 4.4 }
  const page = describeCatalog(catalog, { rates }).find((group) => group.family === 'kiro')
  assert.equal(page.models.find((model) => model.id === 'gpt-5.6-sol').rate, 4.4)
  assert.equal('rate' in page.models.find((model) => model.id === 'deepseek-3.2'), false)
  assert.equal('rate' in describeCatalog(catalog).find((group) => group.family === 'kiro').models[0], false, 'no rates given, no field')

  const routes = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { kiro: true }, kiroModels: rows })
  assert.doesNotMatch(JSON.stringify(routes), /"rate"/)
})

test('the model row shows the multiplier with its own tooltip, in both languages', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /model\.rate && h\('span', \{ className: 'osubs-tag osubs-tag--plain', title: t\.rateTag \}, `×\$\{model\.rate\}`\)/)
  assert.equal(src.match(/rateTag: /g)?.length, 2)
})
