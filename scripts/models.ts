#!/usr/bin/env node
/**
 * Model catalog refresh: every key of `src/catalog/models.json` against its
 * recorded model source (vendor endpoint, CLI list, or public registry).
 *
 *   npm run build && npm run models                    # dry run, every key
 *   npm run models -- codex,kiro                       # some keys
 *   npm run models -- --write [--prune] [--json] [--profile desktop]
 *
 * Read-only toward accounts, like live-smoke: stored logins come from
 * `auth.json` / `opencode-go.json`, a token that expires within 2 minutes is
 * skipped (never refreshed), nothing is written to the store. Model-list calls
 * spend no quota. Egress follows the plugin's outbound proxy file and
 * `HTTPS_PROXY`, because Kiro / Cursor lists are region-filtered.
 *
 * The merge rules and the per-key source table live in docs/models.md; the
 * rules themselves are `src/catalog/merge.ts`. Every adapter reuses the
 * family's own runtime parser, so the snapshot and the live picker read a
 * source the same way.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCatalog, CATALOG_EFFORT_KEYS, CATALOG_KEYS } from '../lib/catalog/index.js'
import { mergeCatalogRows } from '../lib/catalog/merge.js'
import { CODEX_CONTEXT_WINDOW, CODEX_DEFAULT_MAX_TOKENS } from '../lib/oauth/codex/index.js'
import { COPILOT_GPT_CONTEXT_WINDOW } from '../lib/oauth/copilot/index.js'
import { listStoredSessions } from '../lib/oauth/store.js'
import { configureOutbound, outboundFetch, outboundProxyPath } from '../lib/utils/outbound.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG_PATH = join(ROOT, 'src/catalog/models.json')

const args = { keys: [] as string[], write: false, prune: false, json: false, profile: 'desktop' }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--write') args.write = true
  else if (argv[i] === '--prune') args.prune = true
  else if (argv[i] === '--json') args.json = true
  else if (argv[i] === '--profile') args.profile = argv[++i]
  else args.keys.push(...argv[i].split(',').filter(Boolean))
}

const DATA_DIR = `${process.env.HOME}/.dsh/profiles/${args.profile}/data/dsh-plugin-oauth-subs`
const AUTH = `${DATA_DIR}/auth.json`
const TIMEOUT_MS = 30_000
const DSH_LEVELS: readonly string[] = CATALOG_EFFORT_KEYS
/** The only fields a catalog row may carry (docs/models.md 行格式). */
const ROW_FIELDS = ['id', 'name', 'contextWindow', 'maxTokens', 'input', 'reasoningEfforts', 'maxContextWindow', 'fastTier', 'variants', 'defaultUid', 'compat']

class Skip extends Error {}

// ── helpers ───────────────────────────────────────────────────────────────

async function session(provider) {
  const rows = await listStoredSessions(provider, AUTH).catch(() => [])
  if (!rows.length) throw new Skip(`no stored ${provider} account in profile ${args.profile}`)
  const usable = rows.find((row) => row?.session?.expiresAt > Date.now() + 120_000)
  if (!usable) throw new Skip(`every ${provider} token expires within 2 minutes; open the app to refresh it (this script never refreshes)`)
  return usable.session
}

async function getJson(url, init: any = {}) {
  const response = await outboundFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const text = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} → HTTP ${response.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

const pos = (value) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined)
const inputOf = (kinds) => (Array.isArray(kinds) ? ['text', 'image'].filter((kind) => kinds.includes(kind)) : undefined)

/** Vendor effort spellings → DSH-keyed ladder (`none` → `off`), in DSH order. */
function effortsOf(values, { offValue }: any = {}) {
  if (!Array.isArray(values)) return undefined
  const map: any = {}
  for (const value of values) {
    const key = value === 'none' ? 'off' : value
    if (DSH_LEVELS.includes(key)) map[key] = key === 'off' && offValue !== undefined ? offValue : value
  }
  const ordered = Object.fromEntries(DSH_LEVELS.filter((key) => key in map).map((key) => [key, map[key]]))
  return Object.keys(ordered).length ? ordered : false
}

function pick(row) {
  return Object.fromEntries(ROW_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]]))
}

let modelsDev
async function modelsDevBucket(bucket) {
  modelsDev ??= await getJson('https://models.dev/api.json')
  const models = modelsDev?.[bucket]?.models
  if (!models) throw new Error(`models.dev has no "${bucket}" bucket`)
  return models
}

/** models.dev row → catalog fields (effort from `reasoning_options`). */
function fromModelsDev(id, row) {
  const effort = (row.reasoning_options ?? []).find((option) => option?.type === 'effort')
  return {
    id,
    name: row.name,
    contextWindow: pos(row.limit?.context),
    maxTokens: pos(row.limit?.output),
    input: inputOf(row.modalities?.input),
    reasoningEfforts: effort ? effortsOf(effort.values) : false,
  }
}

// ── one adapter per catalog key ───────────────────────────────────────────
//
// `fetch` returns rows normalized to catalog fields; a field the source does
// not carry stays undefined (the merge keeps the catalog value). `keep` /
// `skip` / `newRow` encode decisions recorded in the family README.

const PLAIN_GO_COMPAT = { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' }

async function opencodeGo(protocol) {
  const vault = JSON.parse(readFileSync(`${DATA_DIR}/opencode-go.json`, 'utf8'))
  const key = Object.values<any>(vault.accounts ?? {}).find((entry) => entry?.apiKey)?.apiKey
  if (!key) throw new Skip('no OpenCode Go API key in opencode-go.json')
  const [live, dev] = await Promise.all([
    getJson('https://opencode.ai/zen/go/v1/models', { headers: { authorization: `Bearer ${key}` } }),
    modelsDevBucket('opencode-go'),
  ])
  const rows: any[] = []
  for (const { id } of live.data ?? []) {
    const meta = dev[id]
    // models.dev marks the /responses-only rows with an @ai-sdk/openai provider.
    const responses = meta?.provider?.npm === '@ai-sdk/openai'
    if ((protocol === 'responses') !== responses) continue
    rows.push(meta ? fromModelsDev(id, meta) : { id })
  }
  return rows
}

const ADAPTERS: Record<string, any> = {
  codex: {
    source: 'GET chatgpt.com/backend-api/codex/models?client_version=<CODEX_CLIENT_VERSION>',
    async fetch() {
      const { CODEX_MODELS_URL, CODEX_CLIENT_VERSION, codexUpstreamHeaders } = await import('../lib/oauth/codex/index.js')
      const body = await getJson(`${CODEX_MODELS_URL}?client_version=${CODEX_CLIENT_VERSION}`, { headers: codexUpstreamHeaders(await session('codex')) })
      return (body.models ?? []).filter((m) => m.visibility === 'list').map((m) => ({
        id: m.slug,
        name: String(m.display_name ?? m.slug).replace(/(\d)-(?=[A-Za-z])/g, '$1 '),
        input: inputOf(m.input_modalities),
        // `minimal` and `ultra` 400 on the Responses API (codex/index.ts CODEX_REASONING).
        reasoningEfforts: effortsOf((m.supported_reasoning_levels ?? []).map((level) => level.effort).filter((e) => e !== 'minimal' && e !== 'ultra').concat('none'), { offValue: null }),
        maxContextWindow: pos(m.max_context_window) > pos(m.context_window) ? m.max_context_window : undefined,
        fastTier: Array.isArray(m.service_tiers) ? m.service_tiers.some((tier) => tier?.id === 'priority') : undefined,
      }))
    },
    // The source window is the raw 272K; rows carry the CLI's usable default.
    newRow: (row) => ({ ...row, contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS }),
  },
  grok: {
    source: 'GET cli-chat-proxy.grok.com/v1/models (grok CLI list)',
    async fetch() {
      const { GROK_MODELS_URL, grokUpstreamHeaders } = await import('../lib/oauth/grok/index.js')
      const body = await getJson(GROK_MODELS_URL, { headers: grokUpstreamHeaders(await session('grok')) })
      return (body.data ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        contextWindow: pos(m.context_window),
        maxTokens: pos(m.max_completion_tokens),
        reasoningEfforts: m.supports_reasoning_effort === false ? false : effortsOf((m.reasoning_efforts ?? []).map((e) => e.value)),
      }))
    },
  },
  glm: {
    source: 'GET <coding plan>/api/coding/paas/v4/models (ids only)',
    async fetch() {
      const { glmCodingUrl, glmUpstreamHeaders } = await import('../lib/oauth/glm/index.js')
      const s = await session('glm')
      const body = await getJson(glmCodingUrl(s.region).replace(/\/chat\/completions$/, '/models'), { headers: glmUpstreamHeaders(s) })
      return (body.data ?? []).map((m) => ({ id: m.id }))
    },
    skip: [
      { ids: ['glm-4.5', 'glm-4.5-air', 'glm-4.6', 'glm-4.7', 'glm-5', 'glm-5.1', 'glm-5.2'], why: 'historical id the plan reroutes to 5.3 / 5.3-Flash (glm/README.md 模型)' },
      { ids: ['glm-5.3-flashx'], why: 'official docs: not yet available on the plan' },
    ],
  },
  kiro: {
    source: 'management List-Available-Models, origin=KIRO_CONSOLE (governance list)',
    async fetch() {
      const { fetchKiroLiveModels, toKiroPickerModels } = await import('../lib/oauth/kiro/catalog.js')
      const live = await fetchKiroLiveModels(await session('kiro'), { origin: 'KIRO_CONSOLE' })
      if (!live.length) throw new Error('List-Available-Models returned nothing in every region')
      return toKiroPickerModels(live).map(pick)
    },
  },
  antigravity: {
    source: 'CLIProxyAPI internal/registry/models/models.json → "antigravity" (public)',
    async fetch() {
      const body = await getJson('https://raw.githubusercontent.com/router-for-me/CLIProxyAPI/main/internal/registry/models/models.json')
      // Mapping recorded in antigravity/README.md 模型: levels fold into the
      // three-step Gemini ladder, Claude thinking is low/high, none is false.
      return (body.antigravity ?? []).map((m) => ({
        id: m.id,
        name: String(m.display_name ?? m.id).replace(/\s*\((?:thinking|high|low|medium)\)\s*$/i, ''),
        contextWindow: pos(m.context_length),
        maxTokens: pos(m.max_completion_tokens),
        input: inputOf(m.supportedInputModalities),
        reasoningEfforts: !m.thinking ? false
          : Array.isArray(m.thinking.levels) ? { low: 'low', medium: 'medium', high: 'high' }
            : { low: 'low', high: 'high' },
      }))
    },
  },
  cursor: {
    source: 'agent.v1 GetUsableModels + AvailableModels (egress-filtered)',
    // The floor follows cursor.com/docs/models-and-pricing (cursor/README.md 模型);
    // the live list also carries hidden / legacy ids, so new ids are report-only.
    add: false,
    async fetch() {
      const { fetchCursorAvailableModels, fetchCursorUsableModels } = await import('../lib/oauth/cursor/h2-session.js')
      const { toCursorPickerModels } = await import('../lib/oauth/cursor/catalog.js')
      const s = await session('cursor')
      const [usable, available] = await Promise.all([fetchCursorUsableModels(s), fetchCursorAvailableModels(s)])
      const rows = toCursorPickerModels(usable, available)
      if (!rows.length) throw new Error('GetUsableModels returned nothing')
      // The static floor is family-only; `-fast` twins are grown at runtime.
      const ids = new Set(rows.map((row) => row.id))
      return rows.filter((row) => !(row.id.endsWith('-fast') && ids.has(row.id.slice(0, -5)))).map(pick)
    },
  },
  kimi: {
    source: 'GET api.kimi.com/coding/v1/models',
    async fetch() {
      const { KIMI_MODELS_URL, kimiUpstreamHeaders } = await import('../lib/oauth/kimi/index.js')
      const { toKimiPickerModels } = await import('../lib/oauth/kimi/catalog.js')
      const s = await session('kimi')
      return toKimiPickerModels(await getJson(KIMI_MODELS_URL, { headers: { ...kimiUpstreamHeaders(s), accept: 'application/json' } })).map(pick)
    },
  },
  copilot: {
    source: 'GET {endpoints.api}/models',
    async fetch() {
      const { COPILOT_API_VERSION, copilotIdentityHeaders, copilotModelsUrl } = await import('../lib/oauth/copilot/index.js')
      const { toCopilotPickerModels } = await import('../lib/oauth/copilot/catalog.js')
      const s = await session('copilot')
      const body = await getJson(copilotModelsUrl(s), {
        headers: { authorization: `Bearer ${s.accessToken}`, accept: 'application/json', 'x-github-api-version': COPILOT_API_VERSION, ...copilotIdentityHeaders() },
      })
      return toCopilotPickerModels(body).map(pick)
    },
    // GPT rows keep the Copilot GPT line's 256K default input window; the
    // vendor's larger window stays as `maxContextWindow` (toCopilotPickerModels
    // already emits both).
    newRow: (row) => (String(row?.id ?? '').startsWith('gpt-') ? { ...row, contextWindow: COPILOT_GPT_CONTEXT_WINDOW } : row),
  },
  devin: {
    source: 'ApiServerService/GetCliModelConfigs',
    async fetch() {
      const { devinListModelConfigs, toDevinPickerModels } = await import('../lib/oauth/devin/catalog.js')
      return toDevinPickerModels(await devinListModelConfigs(await session('devin'), { signal: AbortSignal.timeout(TIMEOUT_MS) })).map(pick)
    },
    skip: [{ ids: ['fusion', 'fusion-fast', 'fusion-thinking', 'fusion-thinking-fast'], why: 'maintainer block 2026-09-30: the Fusion family stays out of the picker (devin/README.md 模型)' }],
  },
  cline: {
    source: 'GET api.cline.bot/api/v1/ai/cline/recommended-models (public) + models.dev "openrouter"',
    async fetch() {
      const { CLINE_RECOMMENDED_MODELS_URL } = await import('../lib/oauth/cline/index.js')
      const { toClinePickerModels } = await import('../lib/oauth/cline/catalog.js')
      const [feed, openrouter] = await Promise.all([getJson(CLINE_RECOMMENDED_MODELS_URL), modelsDevBucket('openrouter')])
      const facts = Object.entries<any>(openrouter).map(([id, row]) => fromModelsDev(id, row))
      return toClinePickerModels(feed, { models: facts }).map(pick)
    },
  },
  ollama: {
    source: 'GET ollama.com/api/tags + POST /api/show (public)',
    async fetch() {
      const { OLLAMA_TAGS_URL } = await import('../lib/apikey/ollama/index.js')
      const { applyOllamaShowWindows, toOllamaPickerModels } = await import('../lib/apikey/ollama/catalog.js')
      const rows = toOllamaPickerModels(await getJson(OLLAMA_TAGS_URL))
      return (await applyOllamaShowWindows(rows, { fetchFn: outboundFetch, token: '', signal: AbortSignal.timeout(TIMEOUT_MS * 4) })).map(pick)
    },
  },
  'opencode-go-flash': {
    source: 'GET opencode.ai/zen/go/v1/models (ids) + models.dev "opencode-go" (metadata)',
    fetch: () => opencodeGo('completions'),
    skip: [{ ids: ['deepseek-flash'], why: 'alias of deepseek-v4.1-flash; the picker keeps the docs id (opencode-go/README.md)' }],
    // DeepSeek dialect rows need a live test first (README); new rows start plain.
    newRow: (row) => ({ ...row, compat: { ...PLAIN_GO_COMPAT } }),
  },
  'opencode-go-responses': {
    source: 'GET opencode.ai/zen/go/v1/models (ids) + models.dev "opencode-go" (metadata)',
    fetch: () => opencodeGo('responses'),
    keep: [{ ids: ['gpt-5.6-luna', 'gpt-6-luna'], fields: ['contextWindow'], why: 'maintainer pin 2026-09-29: 258K default input tier, not the 1.05M total (opencode-go/README.md)' }],
  },
  chatgpt: {
    source: 'GET api.openai.com/v1/models (Sign in with ChatGPT access token)',
    async fetch() {
      const { toChatgptPickerModels } = await import('../lib/oauth/chatgpt/catalog.js')
      const { CHATGPT_MODELS_URL, chatgptUpstreamHeaders } = await import('../lib/oauth/chatgpt/index.js')
      return toChatgptPickerModels(await getJson(CHATGPT_MODELS_URL, { headers: chatgptUpstreamHeaders(await session('chatgpt')) }))
    },
  },
  'command-code': { manual: 'no model endpoint; rows come from the command-code CLI bundle registry (command-code/README.md 模型)' },
  ollamaRetired: { manual: 'Ollama Cloud retirements table (ollama/README.md 模型); not a live list' },
}

// ── run ───────────────────────────────────────────────────────────────────

/**
 * Some transports unref their sockets (the Cursor h2 pool), which lets Node
 * exit mid-request with nothing else scheduled; the ref'd timer holds the loop
 * and doubles as the per-key deadline.
 */
function withDeadline(work, key) {
  let timer
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${key} source timed out after ${TIMEOUT_MS * 4}ms`)), TIMEOUT_MS * 4) })
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
}

const unknown = args.keys.filter((key) => !CATALOG_KEYS.includes(key))
if (unknown.length) {
  console.error(`unknown catalog key(s): ${unknown.join(', ')}\nkeys: ${CATALOG_KEYS.join(', ')}`)
  process.exit(2)
}
const keys = args.keys.length ? args.keys : [...CATALOG_KEYS]
const outbound = configureOutbound({ path: outboundProxyPath(DATA_DIR), env: process.env })
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
const report: any[] = []

for (const key of keys) {
  const adapter = ADAPTERS[key]
  if (!adapter || adapter.manual) {
    report.push({ key, status: 'manual', detail: adapter?.manual ?? 'no adapter' })
    continue
  }
  try {
    const source = await withDeadline(adapter.fetch(), key)
    const result = mergeCatalogRows(catalog[key], source, { keep: adapter.keep, skip: adapter.skip, add: adapter.add, prune: args.prune, newRow: adapter.newRow })
    catalog[key] = result.rows
    report.push({ key, status: 'ok', source: adapter.source, offered: source.length, ...result, rows: undefined })
  } catch (error) {
    report.push({ key, status: error instanceof Skip ? 'skipped' : 'failed', detail: error?.message ?? String(error) })
  }
}
await outbound.close()

const dirty = report.some((r) => r.status === 'ok' && (r.added.length || r.changed.length || r.removed.length))
if (args.write && dirty) {
  assertCatalog(catalog)
  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`)
}

if (args.json) {
  console.log(JSON.stringify({ written: args.write && dirty, report }, null, 2))
} else {
  const brief = (value) => JSON.stringify(value) ?? 'undefined'
  for (const r of report) {
    if (r.status !== 'ok') {
      console.log(`${r.status.toUpperCase().padEnd(7)} ${r.key}  ${r.detail}`)
      continue
    }
    const counts = [`+${r.added.length}`, `~${r.changed.length}`, `-${r.removed.length}`, `missing ${r.missing.length}`].join(' ')
    console.log(`OK      ${r.key}  ${counts}  (${r.offered} from ${r.source})`)
    for (const row of r.added) console.log(`  + ${row.id}  ${brief(pick(row))}`)
    for (const c of r.changed) console.log(`  ~ ${c.id}.${c.field}  ${brief(c.from)} → ${brief(c.to)}`)
    for (const c of r.kept) console.log(`  = ${c.id}.${c.field}  source ${brief(c.to)} kept ${brief(c.from)}: ${c.why}`)
    for (const id of r.missing) console.log(`  ${r.removed.includes(id) ? '-' : '?'} ${id}  not in source${r.removed.includes(id) ? ' (pruned)' : ''}`)
    for (const row of r.unresolved) console.log(`  ! ${row.id}  new id without metadata; add by hand with a README source`)
    if (r.notAdded.length) console.log(`  > not added (curated key): ${r.notAdded.map((row) => row.id).join(', ')}`)
    for (const s of r.skipped) console.log(`  · ${s.id}  skipped: ${s.why}`)
  }
  console.log(args.write ? (dirty ? `\nwrote ${CATALOG_PATH}; run npm run build, then record sources in each family README` : '\nnothing to write') : '\ndry run; pass --write to apply')
}
process.exit(report.some((r) => r.status === 'failed') ? 1 : 0)
