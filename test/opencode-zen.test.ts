import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { ModelSwitch } from '../lib/oauth/model-switch.js'
import {
  OPENCODE_GO_ROUTES,
  OPENCODE_GO_SESSION_HEADER,
  OPENCODE_GO_SESSION_ID,
  OPENCODE_ZEN_ANTHROPIC_BASE_URL,
  OPENCODE_ZEN_CHAT_MODELS,
  OPENCODE_ZEN_CHAT_ROUTE,
  OPENCODE_ZEN_MESSAGES_MODELS,
  OPENCODE_ZEN_MESSAGES_ROUTE,
  OPENCODE_ZEN_OPENAI_BASE_URL,
  OPENCODE_ZEN_RESPONSES_MODELS,
  OPENCODE_ZEN_RESPONSES_ROUTE,
  OPENCODE_ZEN_ROUTES,
} from '../lib/apikey/opencode-go/models.js'
import {
  fetchOpencodeGoQuota,
  opencodeZenQuotaRows,
  parseOpencodeZenBilling,
} from '../lib/apikey/opencode-go/quota.js'
import { ensureOpencodeGoRoute, ensureOpencodeZenRoute } from '../lib/oauth/harness-sync.js'
import {
  APIKEY_FAMILY_IDS,
  HARNESS_ANTHROPIC_API,
  HARNESS_COMPLETIONS_API,
  HARNESS_RESPONSES_API,
  OPENCODE_GO_API_KEY_ENV,
  assertDshServiceableProvider,
  catalogProviders,
  harnessModelAlias,
} from '../lib/oauth/models.js'
import { assembleUi } from '../scripts/ui-bundle.ts'

/**
 * OpenCode Zen rides the Go family's vault, credential and Console session
 * (one OpenCode account, two products), so these tests pin the seams that make
 * that safe: three extra routes on the shared key, no header theft between the
 * two products, and the Zen Console reads that feed the account card.
 */

function createPiAiSettings(initialProviders = {}) {
  const section = { providers: structuredClone(initialProviders) }
  const ops = []
  return {
    ops,
    section,
    describe() {
      return [{ ns: 'llm-pi-ai', value: structuredClone(section) }]
    },
    async mutate(target, mutations) {
      if (target !== 'llm-pi-ai') throw new Error(`unknown settings namespace ${target}`)
      const next = { providers: { ...section.providers } }
      for (const row of mutations) {
        const key = row.path?.[1]
        if (row.path?.[0] !== 'providers' || typeof key !== 'string') throw new Error('bad path')
        if (row.op === 'unset') delete next.providers[key]
        else if (row.op === 'set') {
          assertDshServiceableProvider(key, row.value)
          next.providers[key] = structuredClone(row.value)
        }
      }
      section.providers = next.providers
      ops.push({ target, mutations })
    },
  }
}

function consoleFetch(routes) {
  return async (url) => {
    const path = String(url).replace('https://opencode.ai', '')
    const hit = Object.entries(routes).find(([prefix]) => path.startsWith(prefix))
    if (!hit) return new Response('not found', { status: 404 })
    const value = hit[1]
    if (value instanceof Response) return value
    if (value && value.status) return new Response(JSON.stringify(value.body ?? ''), { status: value.status })
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

const CONSOLE_STATUS = {
  subscriberUserId: 'acc_1',
  product: 'go',
  renewalProduct: 'go',
  useBalance: false,
  access: {
    startsAt: '2026-09-10T10:32:57.000Z',
    endsAt: '2026-10-10T10:32:57.000Z',
    meters: {
      fiveHour: { usedMicroCents: 200_000_000, limitMicroCents: 1_200_000_000 },
      week: { usedMicroCents: 300_000_000, limitMicroCents: 3_000_000_000 },
      month: { usedMicroCents: 400_000_000, limitMicroCents: 6_000_000_000 },
    },
  },
}

test('OpenCode Zen ships one route per wire protocol on the shared OpenCode key', () => {
  assert.deepEqual(OPENCODE_ZEN_ROUTES.map((route) => route.id), [
    'opencode-zen-chat', 'opencode-zen-responses', 'opencode-zen-messages',
  ])
  assert.deepEqual(OPENCODE_ZEN_ROUTES.map((route) => route.displayName), [
    'Subs · OpenCode Zen · Chat',
    'Subs · OpenCode Zen · Responses',
    'Subs · OpenCode Zen · Anthropic',
  ])
  assert.deepEqual(OPENCODE_ZEN_ROUTES.map((route) => route.api), [
    HARNESS_COMPLETIONS_API, HARNESS_RESPONSES_API, HARNESS_ANTHROPIC_API,
  ])
  // The Anthropic SDK appends /v1/messages itself, so that origin stops earlier.
  assert.equal(OPENCODE_ZEN_CHAT_ROUTE.baseURL, OPENCODE_ZEN_OPENAI_BASE_URL)
  assert.equal(OPENCODE_ZEN_RESPONSES_ROUTE.baseURL, OPENCODE_ZEN_OPENAI_BASE_URL)
  assert.equal(OPENCODE_ZEN_MESSAGES_ROUTE.baseURL, OPENCODE_ZEN_ANTHROPIC_BASE_URL)
  // Zen documents no x-opencode-session requirement: only Go's routes carry it.
  for (const route of OPENCODE_ZEN_ROUTES) assert.equal(route.headers, undefined)
  for (const route of OPENCODE_GO_ROUTES) {
    assert.equal(route.headers[OPENCODE_GO_SESSION_HEADER], OPENCODE_GO_SESSION_ID)
  }
  assert.deepEqual(
    [OPENCODE_ZEN_CHAT_MODELS.length, OPENCODE_ZEN_RESPONSES_MODELS.length, OPENCODE_ZEN_MESSAGES_MODELS.length],
    [8, 14, 8],
  )
  assert.deepEqual(
    APIKEY_FAMILY_IDS.filter((id) => id.startsWith('opencode-zen')),
    ['opencode-zen-chat', 'opencode-zen-responses', 'opencode-zen-messages'],
  )
})

test('Zen rows keep the docs protocol split and invent no completions compat', () => {
  const ids = (models) => models.map((model) => model.id)
  assert.deepEqual(ids(OPENCODE_ZEN_MESSAGES_MODELS), [
    'claude-fable-5-1', 'claude-haiku-4-5', 'claude-haiku-5-5', 'claude-opus-5-5',
    'claude-sonnet-5', 'claude-sonnet-5-5', 'qwen3.6-plus', 'qwen3.8-flash',
  ])
  assert.equal(ids(OPENCODE_ZEN_RESPONSES_MODELS).includes('gpt-5.5'), true)
  assert.equal(ids(OPENCODE_ZEN_CHAT_MODELS).includes('glm-5.3'), true)
  // Free-tier rows are unreachable from a non-OpenCode client (403 FreeTierError).
  for (const model of [...OPENCODE_ZEN_CHAT_MODELS, ...OPENCODE_ZEN_RESPONSES_MODELS, ...OPENCODE_ZEN_MESSAGES_MODELS]) {
    assert.equal(model.id.endsWith('-free'), false, `${model.id} is a free-tier row`)
    assert.equal(typeof model.contextWindow, 'number')
    assert.ok(model.contextWindow > 0)
  }
  // Chat rows start on plain OpenAI compat (a DeepSeek dialect needs a live test).
  for (const model of OPENCODE_ZEN_CHAT_MODELS) {
    assert.deepEqual(model.compat, { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' })
  }
  for (const model of [...OPENCODE_ZEN_RESPONSES_MODELS, ...OPENCODE_ZEN_MESSAGES_MODELS]) {
    assert.equal(model.compat, undefined)
  }
})

test('Zen windows: the docs 272K default tier is pinned, everything else is the source window', () => {
  const byId = new Map(OPENCODE_ZEN_RESPONSES_MODELS.map((model) => [model.id, model]))
  for (const id of ['gpt-5.5', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-5.6-terra']) {
    assert.equal(byId.get(id).contextWindow, 272_000, `${id} keeps the documented default tier`)
  }
  assert.equal(byId.get('gpt-5.3-codex-spark').contextWindow, 128_000)
  assert.equal(byId.get('grok-4.7').contextWindow, 500_000)
})

test('catalogProviders lists Zen on the shared key env, without Go headers', () => {
  const providers = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  for (const route of OPENCODE_ZEN_ROUTES) {
    const value = providers[route.id]
    assert.equal(value.apiKeyEnv, OPENCODE_GO_API_KEY_ENV)
    assert.equal(value.api, route.api)
    assert.equal(value.baseURL, route.baseURL)
    assert.equal(value.headers, undefined)
    assert.equal(value.models.length, route.models.length)
  }
  for (const route of OPENCODE_GO_ROUTES) {
    assert.deepEqual(providers[route.id].headers, { [OPENCODE_GO_SESSION_HEADER]: OPENCODE_GO_SESSION_ID })
  }
})

test('settings.yaml aliases name the OpenCode product, not the route id', () => {
  assert.equal(harnessModelAlias('opencode-zen-responses', 'gpt-5.5'), 'OpenCode Zen/gpt-5.5')
  assert.equal(harnessModelAlias('opencode-zen-chat', 'glm-5.3'), 'OpenCode Zen/glm-5.3')
  assert.equal(harnessModelAlias('opencode-go-flash', 'glm-5.3'), 'OpenCode Go/glm-5.3')
  assert.equal(harnessModelAlias('oauth-codex', 'gpt-5.5'), 'Codex/gpt-5.5')
})

test('ensureOpencodeZenRoute writes, filters and retires the three Zen routes', async () => {
  const settings = createPiAiSettings()
  const planned = await ensureOpencodeZenRoute(settings, { selected: undefined, apiKeySet: true, apply: false })
  assert.equal(planned.status, 'pending')
  assert.equal(planned.mutations.length, 3)
  for (const mutation of planned.mutations) {
    assert.equal(mutation.op, 'set')
    assert.equal(mutation.value.apiKeyEnv, OPENCODE_GO_API_KEY_ENV)
    assert.equal(mutation.value.headers, undefined)
    assert.equal(mutation.value.models[0].name.startsWith('OpenCode Zen/'), true)
  }
  assert.deepEqual(settings.section.providers, {})

  const written = await ensureOpencodeZenRoute(settings, { selected: undefined, apiKeySet: true })
  assert.equal(written.status, 'written')
  for (const route of OPENCODE_ZEN_ROUTES) {
    assert.equal(settings.section.providers[route.id].models.length, route.models.length)
  }
  // Idempotent: the same selection is not rewritten.
  const again = await ensureOpencodeZenRoute(settings, { selected: undefined, apiKeySet: true })
  assert.equal(again.status, 'present')

  // Picker selection narrows each route to its own keys.
  const one = `opencode-zen-responses/${OPENCODE_ZEN_RESPONSES_MODELS[0].id}`
  await ensureOpencodeZenRoute(settings, { selected: [one], apiKeySet: true })
  assert.deepEqual(settings.section.providers['opencode-zen-responses'].models.map((model) => model.id), [OPENCODE_ZEN_RESPONSES_MODELS[0].id])
  assert.equal(settings.section.providers['opencode-zen-chat'], undefined)
  assert.equal(settings.section.providers['opencode-zen-messages'], undefined)

  // No key → every Zen route leaves DSH's model list.
  await ensureOpencodeZenRoute(settings, { selected: undefined, apiKeySet: false })
  for (const route of OPENCODE_ZEN_ROUTES) assert.equal(settings.section.providers[route.id], undefined)
})

test('ensureOpencodeZenRoute touches neither a user profile nor DSH\'s own opencode route', async () => {
  const userRoute = {
    displayName: 'Mine',
    api: HARNESS_RESPONSES_API,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
    baseURL: OPENCODE_ZEN_OPENAI_BASE_URL,
    models: [{ id: 'handcrafted', name: 'handcrafted', contextWindow: 1000 }],
  }
  const settings = createPiAiSettings({
    'opencode-zen-chat': structuredClone(userRoute),
    opencode: { apiKeyEnv: OPENCODE_GO_API_KEY_ENV },
  })
  const result = await ensureOpencodeZenRoute(settings, { selected: undefined, apiKeySet: true })
  assert.equal(result.status, 'written')
  // A route whose shape is not ours stays byte-for-byte.
  assert.deepEqual(settings.section.providers['opencode-zen-chat'], userRoute)
  // DSH's built-in Zen catalog route is the user's to enable; never written.
  assert.deepEqual(settings.section.providers.opencode, { apiKeyEnv: OPENCODE_GO_API_KEY_ENV })
  assert.equal(settings.ops.some((op) => op.mutations.some((mutation) => mutation.path?.[1] === 'opencode')), false)
})

test('the Go writer still owns the session header and cleans the retired profile', async () => {
  const legacy = { apiKeyEnv: OPENCODE_GO_API_KEY_ENV, headers: { [OPENCODE_GO_SESSION_HEADER]: OPENCODE_GO_SESSION_ID } }
  const settings = createPiAiSettings({ 'opencode-go': structuredClone(legacy) })
  const result = await ensureOpencodeGoRoute(settings, { selected: undefined, apiKeySet: true })
  assert.equal(result.status, 'written')
  assert.equal(settings.section.providers['opencode-go'], undefined)
  assert.deepEqual(settings.section.providers['opencode-go-flash'].headers, legacy.headers)
})

test('Zen Console parsers read the billing and 30-day usage payloads', () => {
  assert.deepEqual(parseOpencodeZenBilling({
    billingMode: 'prepaid',
    mode: 'pay-as-you-go',
    balanceMicroCents: '0',
    creditLimitMicroCents: null,
    availableMicroCents: '1250000000',
  }), { mode: 'prepaid', balanceUSD: 0, availableUSD: 12.5 })
  assert.equal(parseOpencodeZenBilling(undefined), undefined)
  // The workspace usage ledger (`/console/api/usage/summary`) is deliberately
  // not read: it is the account's, not Zen's, and Zen's card is wallet-only.
})

test('quota reads carry the Zen side of the account, Zen-only workspaces included', async () => {
  const quota = await fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x' }, {
    fetchFn: consoleFetch({
      '/console/api/orgs': [{ id: 'wrk_abc123', name: 'Default' }],
      '/console/api/go/status': CONSOLE_STATUS,
      '/console/api/billing/status': { billingMode: 'prepaid', mode: 'pay-as-you-go', balanceMicroCents: '0' },
      '/console/api/usage/summary': { totalRequests: '31580', totalCostMicroCents: '4845844474' },
      '/console/api/user': { id: 'usr_1', email: 'dev@example.com' },
    }),
  })
  // Three Go meters, then the Zen wallet row the Zen card filters out of them.
  assert.equal(quota.rows.length, 4)
  assert.deepEqual(quota.rows.map((row) => row.kind), ['primary', 'weekly', 'monthly', 'zen-balance'])
  assert.deepEqual(quota.rows[3], { key: 'zen-balance', kind: 'zen-balance', remaining: 0, unit: 'usd' })
  assert.deepEqual(quota.zen, { mode: 'prepaid', balanceUSD: 0 })
  assert.equal(quota.workspaceUsage, undefined)

  // A pay-as-you-go workspace has no Go subscription object; the Zen numbers
  // still make a usable card, so the read must not fail.
  const zenOnly = await fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x', workspaceId: 'wrk_abc123' }, {
    fetchFn: consoleFetch({
      '/console/api/go/status': { access: null },
      '/console/api/billing/status': { billingMode: 'prepaid', mode: 'pay-as-you-go', balanceMicroCents: '0' },
      '/console/api/usage/summary': { totalRequests: '12', totalCostMicroCents: '250000000' },
    }),
  })
  // No Go meters at all: the remaining rows are the Zen wallet, $0 included.
  assert.deepEqual(zenOnly.rows.map((row) => row.kind), ['zen-balance'])
  assert.equal(zenOnly.rows[0].remaining, 0)
  assert.equal(zenOnly.zen.balanceUSD, 0)

  // A lapsed Go subscription keeps its subscriber identity in the payload —
  // the card names it 「订阅已结束」 instead of erroring or faking meters.
  const lapsed = await fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x', workspaceId: 'wrk_abc123' }, {
    fetchFn: consoleFetch({
      '/console/api/go/status': { access: null, subscriberUserId: 'acc_x', resumability: 'access-ended', renewalProduct: 'go' },
      '/console/api/billing/status': { billingMode: 'prepaid', mode: 'pay-as-you-go', balanceMicroCents: '0' },
    }),
  })
  assert.deepEqual(lapsed.rows.map((row) => row.kind), ['zen-balance'])
  assert.deepEqual(lapsed.subscription, { state: 'ended', product: 'go' })

  // The same lapsed payload without a Zen wallet still draws the state line —
  // only a workspace that never had a subscription at all errors.
  const lapsedNoZen = await fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x', workspaceId: 'wrk_abc123' }, {
    fetchFn: consoleFetch({
      '/console/api/go/status': { access: null, subscriberUserId: 'acc_x', resumability: 'access-ended' },
      '/console/api/billing/status': { billingMode: 'seat', mode: 'invoiceable' },
    }),
  })
  assert.deepEqual(lapsedNoZen.rows, [])
  assert.equal(lapsedNoZen.subscription.state, 'ended')

  // Without a Go subscription and without any Zen read there is still nothing
  // to show, and the error stays the Go one.
  await assert.rejects(
    () => fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x', workspaceId: 'wrk_abc123' }, {
      fetchFn: consoleFetch({
        '/console/api/go/status': { access: null },
        '/console/api/billing/status': { billingMode: 'seat', mode: 'invoiceable' },
      }),
    }),
    /not active/,
  )
})

test('Zen card rows: balance always, credit only when the workspace has one', () => {
  assert.deepEqual(opencodeZenQuotaRows(undefined), [])
  assert.deepEqual(opencodeZenQuotaRows({ mode: 'prepaid' }), [])
  assert.deepEqual(
    opencodeZenQuotaRows({ balanceUSD: 0, availableUSD: 12.5, creditLimitUSD: 0, spendUSD: 48.45844474, requests: 31580 }),
    [{ key: 'zen-balance', kind: 'zen-balance', remaining: 0, unit: 'usd' }],
  )
  // A credit line adds the 可用额度 row (available / limit).
  assert.deepEqual(opencodeZenQuotaRows({ balanceUSD: 3, availableUSD: 30, creditLimitUSD: 27 }), [
    { key: 'zen-balance', kind: 'zen-balance', remaining: 3, unit: 'usd' },
    { key: 'zen-credit', kind: 'zen-credit', remaining: 30, total: 27, unit: 'usd' },
  ])
})

test('the Settings UI names OpenCode Zen and draws its wallet rows', () => {
  const ui = assembleUi()
  // The rail entry is per product; the label map is built from the id list.
  assert.match(ui, /\[id, 'OpenCode Zen'\]/)
  assert.match(ui, /OPENCODE_ZEN_IDS/)
  for (const expected of [
    "if (row.kind === 'zen-balance') return t.opencodeGoZenBalance",
    "if (row.kind === 'zen-credit') return t.opencodeGoZenCredit",
    "opencodeGoZenBalance: '预付余额'",
    "opencodeGoZenCredit: '可用额度'",
    "opencodeGoZenBalance: 'Prepaid balance'",
    "opencodeGoZenCredit: 'Available credit'",
  ]) {
    assert.equal(ui.includes(expected), true, expected)
  }
  // Wallet-only: no usage ledger, no request counter under the Zen heading.
  for (const gone of ['workspace-usage', 'opencodeGoZenCalls', 'opencodeGoWorkspaceUsage']) {
    assert.equal(ui.includes(gone), false, gone)
  }
  // An empty Go card names the subscription state, not the generic 「周额度未
  // 返回」 — the workspace's meters genuinely do not exist.
  for (const expected of [
    "quota.subscription?.state",
    "opencodeGoNoSubscription: '未开通 Go 订阅'",
    "opencodeGoSubscriptionEnded: 'Go 订阅已结束'",
    "opencodeGoSubscriptionEnded: 'Go subscription ended'",
    "opencodeGoNoSubscription: 'No Go subscription'",
  ]) {
    assert.equal(ui.includes(expected), true, expected)
  }
})

test('Zen keeps its own card: Go meters and the Zen wallet never mix', () => {
  const ui = assembleUi()
  // One account, two products: the credential and the Console read stay shared,
  // but each product gets its own 额度 card (a Zen entry that rendered the Go
  // card, or nothing at all, is the bug this pins) — and its own legend, or the
  // wallet card renders as a bare article under the OpenCode Go heading.
  for (const expected of [
    'const opencodeProductView = (keep) => {',
    'const opencodeGoView = opencodeProductView((row) => !isZenRow(row))',
    'const opencodeZenView = opencodeProductView(isZenRow)',
    'const zenVisible = zenAccounts.some((row) => (row?.quota?.rows ?? []).some(isZenRow))',
    'function ZenQuotaCard({ t, account, onRefresh })',
    "h(QuotaBlock, { t, family: 'opencode-zen', quota })",
    "quotaPanel('opencode-go', card('opencode-go', opencodeGoView))",
    'function ZenQuotaPanel({ t, title, account, onRefresh })',
    "h('section', { className: 'osubs-card osubs-card--legend' },",
    "h('div', { className: 'osubs-accts' }, h(ZenQuotaCard, { t, account, onRefresh }))",
    "quotaPanel('opencode-zen', h(ZenQuotaPanel, {",
    "title: usageFamilyName(t, 'opencode-zen'),",
    "id !== 'opencode-zen' || zenVisible",
  ]) {
    assert.equal(ui.includes(expected), true, expected)
  }
})

test('controller sync writes both OpenCode products and drops Zen with the key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-zen-'))
  const keys = new Map()
  const credentials = {
    async describe(ref) { return { configured: keys.has(ref), writable: true } },
    async resolve(ref) { return keys.has(ref) ? { value: keys.get(ref), source: 'file' } : undefined },
    async set(ref, value) { keys.set(ref, value) },
    async unset(ref) { keys.delete(ref) },
  }
  const store = createPiAiSettings()
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: store,
    credentials,
    models: new ModelSwitch(),
    cursorAutoImport: false,
    ollamaAutoImport: false,
    kimiAutoImport: false,
  })
  await controller.sync()
  // One OpenCode account, no key yet: neither product's routes exist.
  for (const route of [...OPENCODE_GO_ROUTES, ...OPENCODE_ZEN_ROUTES]) {
    assert.equal(store.section.providers[route.id], undefined)
  }

  const saved = await controller.saveOpencodeGo({ apiKey: 'sk-test' })
  assert.equal(keys.get(OPENCODE_GO_API_KEY_ENV), 'sk-test')
  await controller.sync()
  for (const route of OPENCODE_ZEN_ROUTES) {
    const written = store.section.providers[route.id]
    assert.deepEqual(written.models.map((model) => model.id), route.models.map((model) => model.id))
    assert.equal(written.apiKeyEnv, OPENCODE_GO_API_KEY_ENV)
    assert.equal(written.headers, undefined)
    // settings.yaml shows the alias without the provider group, so it names the product.
    assert.equal(written.models[0].name, `OpenCode Zen/${route.models[0].id}`)
  }

  await controller.clearOpencodeGo('key', saved.activeId)
  assert.equal(keys.has(OPENCODE_GO_API_KEY_ENV), false)
  await controller.sync()
  for (const route of OPENCODE_ZEN_ROUTES) assert.equal(store.section.providers[route.id], undefined)
})

