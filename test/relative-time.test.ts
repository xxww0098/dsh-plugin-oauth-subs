import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { formatRelativeReset } from '../lib/utils/relative-time.js'

const ZH = {
  soon: '即将重置',
  suffix: '{n}后重置',
  minute: '{n} 分钟',
  hour: '{n} 小时',
  day: '{n} 天',
}

const EN = {
  soon: 'reset imminent',
  suffix: 'resets in {n}',
  minute: '{n} min',
  hour: '{n} h',
  day: '{n} d',
}

const NOW = Date.parse('2026-08-31T12:00:00Z')

function at(deltaMs: number) {
  return NOW + deltaMs
}

test('formatRelativeReset is precise to the minute, not rounded hours', () => {
  assert.equal(formatRelativeReset(at(4 * 3600_000 + 32 * 60_000), ZH, NOW), '4 小时 32 分钟后重置')
  assert.equal(formatRelativeReset(at(5 * 3600_000), ZH, NOW), '5 小时后重置')
  assert.equal(formatRelativeReset(at(47 * 60_000), ZH, NOW), '47 分钟后重置')
  assert.equal(formatRelativeReset(at(90 * 60_000), ZH, NOW), '1 小时 30 分钟后重置')
  assert.equal(formatRelativeReset(at(4 * 3600_000 + 32 * 60_000), EN, NOW), 'resets in 4 h 32 min')
  assert.equal(formatRelativeReset(at(5 * 3600_000), EN, NOW), 'resets in 5 h')
})

test('formatRelativeReset keeps leftover minutes on multi-day windows', () => {
  assert.equal(formatRelativeReset(at(2 * 86400_000 + 3 * 3600_000 + 12 * 60_000), ZH, NOW), '2 天 3 小时 12 分钟后重置')
  assert.equal(formatRelativeReset(at(6 * 86400_000), ZH, NOW), '6 天后重置')
  assert.equal(formatRelativeReset(at(6 * 86400_000 + 23 * 60_000), ZH, NOW), '6 天 23 分钟后重置')
  assert.equal(formatRelativeReset(at(2 * 86400_000 + 3 * 3600_000 + 12 * 60_000), EN, NOW), 'resets in 2 d 3 h 12 min')
})

test('formatRelativeReset stays relative past 14 days', () => {
  assert.equal(formatRelativeReset(NOW - 1, ZH, NOW), '即将重置')
  assert.equal(formatRelativeReset(0, ZH, NOW), '')
  assert.equal(formatRelativeReset(NaN, ZH, NOW), '')
  assert.equal(formatRelativeReset(at(14 * 86400_000), ZH, NOW), '14 天后重置')
  assert.equal(formatRelativeReset(at(21 * 86400_000 + 4 * 3600_000 + 12 * 60_000), ZH, NOW), '21 天 4 小时 12 分钟后重置')
  assert.equal(formatRelativeReset(at(13 * 86400_000 + 23 * 3600_000), ZH, NOW), '13 天 23 小时后重置')
})

test('Settings formatReset no longer rounds remaining hours', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /const hours = Math\.floor\(\(totalMinutes % 1440\) \/ 60\)/)
  assert.match(src, /const minutes = totalMinutes % 60/)
  assert.match(src, /resetIn:\s*'\{n\}后重置'/)
  assert.match(src, /resetIn:\s*'resets in \{n\}'/)
  assert.equal(src.includes('Math.round(minutes / 60)'), false)
  assert.equal(src.includes('resetHours:'), false)
  assert.equal(src.includes('if (days >= 14) return formatStamp(resetAt)'), false)
})
