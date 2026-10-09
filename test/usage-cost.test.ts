import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usageRowCost, usageRowCosts } from '../lib/utils/usage-cost.js'

const HOUR = Math.floor(Date.now() / 3_600_000)
const row = (family, model, calls, input, output, cacheRead, cacheWrite) =>
  [HOUR, family, model, calls, input, output, cacheRead, cacheWrite, 0, 0, 0, 0, 0, 0]
const near = (actual, expected, label) => assert.ok(
  actual !== null && Math.abs(actual - expected) < 1e-9,
  `${label}: ${actual} ≉ ${expected}`,
)

test('a codex row prices input/output/cache read/cache write at the base rates', () => {
  // gpt-6.1-sol: in 2, out 10, cacheRead 0.1, cacheWrite 2.5 (USD/1M).
  // 25 calls over 6M prompt tokens keeps the 240K average under the 272K tier.
  near(usageRowCost(row('codex', 'gpt-6.1-sol', 25, 1_000_000, 500_000, 4_000_000, 1_000_000)),
    2 + 5 + 0.4 + 2.5, 'base mix')
})

test('a row whose average prompt crosses tierThreshold prices at the surcharge tier', () => {
  // Tier band: in 4, out 15, cacheRead 0.2; the row's cache write is 0 tokens.
  near(usageRowCost(row('codex', 'gpt-6.1-sol', 1, 300_000, 100_000, 0, 0)), 1.2 + 1.5, 'tiered')
  // Same tokens over two calls: 150K average stays on the base row.
  near(usageRowCost(row('codex', 'gpt-6.1-sol', 2, 300_000, 100_000, 0, 0)), 0.6 + 1, 'base')
})

test('an old context-suffix route id prices at its base row', () => {
  const suffixed = row('codex', 'gpt-6.1-sol-900k', 3, 900_000, 0, 0, 0)
  const plain = row('codex', 'gpt-6.1-sol', 3, 900_000, 0, 0, 0)
  assert.equal(usageRowCost(suffixed), usageRowCost(plain), 'codex -900k')
  const glmSuffixed = row('glm', 'glm-5.3-1m', 3, 900_000, 0, 0, 0)
  const glmPlain = row('glm', 'glm-5.3', 3, 900_000, 0, 0, 0)
  assert.equal(usageRowCost(glmSuffixed), usageRowCost(glmPlain), 'glm -1m')
})

test('a family without a cache-write rate folds cache writes at the input rate', () => {
  // grok-4.7 lists no cacheWrite: 1M cache-write tokens price at in=2.
  near(usageRowCost(row('grok', 'grok-4.7', 10, 0, 0, 0, 1_000_000)), 2, 'grok cache write')
})

test('opencode-go usage resolves the split rate tables by model id', () => {
  // minimax-m3 lives in opencode-go-messages; 2M prompt over 1 call crosses its 512K tier.
  near(usageRowCost(row('opencode-go', 'minimax-m3', 1, 1_000_000, 1_000_000, 0, 0)), 0.6 + 2.4, 'messages tier')
})

test('ids with a slash and -fast twins resolve inside their own table', () => {
  assert.ok(usageRowCost(row('cline', 'openai/gpt-6.1-sol', 1, 1_000_000, 0, 0, 0)) !== null, 'cline slashed id')
  assert.ok(usageRowCost(row('codex', 'gpt-6.1-sol-fast', 25, 1_000_000, 0, 0, 0)) !== null, 'codex fast twin')
})

test('a model without a rate row prices as null, never 0', () => {
  assert.equal(usageRowCost(row('deepseek', 'deepseek-chat', 1, 1_000_000, 1_000_000, 0, 0)), null)
  assert.equal(usageRowCost(row('codex', 'not-a-model', 1, 1, 1, 0, 0)), null)
  const costs = usageRowCosts([row('deepseek', 'deepseek-chat', 1, 1, 1, 0, 0), row('grok', 'grok-4.7', 10, 1_000_000, 0, 0, 0)])
  assert.equal(costs.length, 2)
  assert.equal(costs[0], null)
  assert.ok(costs[1] !== null && costs[1] > 0)
})
