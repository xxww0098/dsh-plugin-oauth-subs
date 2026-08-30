import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { GLM_BOOST_HINT, GLM_BOOST_LABEL, glmCardBoost } from '../lib/oauth/glm/boost.js'

function accountCardPills(family, locale, { plan, active, region } = {}) {
  const tags = []
  if (plan) tags.push(plan)
  if (active) tags.push(locale === 'en' ? 'In use' : '使用中')
  if (family === 'glm' && region) tags.push(region)
  const boost = glmCardBoost(family, locale)
  if (boost) tags.push(boost.label)
  return tags
}

test('GLM card boost wording is exactly 150%配额 / 150% quota', () => {
  assert.equal(GLM_BOOST_LABEL.zh, '150%配额')
  assert.equal(GLM_BOOST_LABEL.en, '150% quota')
  assert.equal(GLM_BOOST_HINT.zh, 'ZCode 登录使用享 150%配额')
  assert.equal(GLM_BOOST_HINT.en, 'ZCode session: 150% quota')
  assert.deepEqual(glmCardBoost('glm', 'zh'), {
    label: '150%配额',
    hint: 'ZCode 登录使用享 150%配额',
  })
  assert.deepEqual(glmCardBoost('glm', 'en'), {
    label: '150% quota',
    hint: 'ZCode session: 150% quota',
  })
})

test('GLM logged-in card render includes the 150% boost pill; other families do not', () => {
  const glmZh = accountCardPills('glm', 'zh', { plan: 'LITE', active: true, region: '中国' })
  const glmEn = accountCardPills('glm', 'en', { plan: 'LITE', active: true, region: 'China' })
  assert.deepEqual(glmZh, ['LITE', '使用中', '中国', '150%配额'])
  assert.deepEqual(glmEn, ['LITE', 'In use', 'China', '150% quota'])
  assert.equal(glmZh.includes('150%配额'), true)
  assert.equal(glmEn.includes('150% quota'), true)

  for (const family of ['codex', 'grok', 'antigravity']) {
    const zh = accountCardPills(family, 'zh', { plan: 'Pro', active: true })
    const en = accountCardPills(family, 'en', { plan: 'Pro', active: true })
    assert.equal(zh.includes('150%配额'), false)
    assert.equal(en.includes('150% quota'), false)
    assert.equal(glmCardBoost(family, 'zh'), undefined)
    assert.equal(glmCardBoost(family, 'en'), undefined)
  }
})

test('Settings client paints the GLM boost pill and hint only on the GLM card', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /glmBoost:\s*'150%配额'/)
  assert.match(src, /glmBoost:\s*'150% quota'/)
  assert.match(src, /glmBoostHint:\s*'ZCode 登录使用享 150%配额'/)
  assert.match(src, /glmBoostHint:\s*'ZCode session: 150% quota'/)
  assert.match(src, /id === 'glm' && h\('span', \{ className: 'osubs-tag osubs-tag--plain' \}, t\.glmBoost\)/)
  assert.match(src, /family === 'glm' && h\('p', \{ className: 'osubs-note' \}, t\.glmBoostHint\)/)
  assert.equal((src.match(/t\.glmBoost\b/g) || []).length, 1)
  assert.equal((src.match(/t\.glmBoostHint\b/g) || []).length, 1)
})
