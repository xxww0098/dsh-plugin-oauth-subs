import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Config } from '../lib/index.js'

test('Config is a Standard Schema that fills defaults', () => {
  assert.equal(typeof Config['~standard']?.validate, 'function')
  const result = Config['~standard'].validate({
    port: 8318,
    provider: 'oauth',
    grokLogin: 'device',
  })
  assert.equal('then' in result, false)
  assert.equal(result.issues, undefined)
  assert.equal(result.value.port, 8318)
  assert.equal(result.value.bind, undefined)
  assert.equal(result.value.grokLogin, 'device')
})

test('Config rejects an unknown grokLogin', () => {
  const result = Config['~standard'].validate({ grokLogin: 'sms' })
  assert.equal(Boolean(result.issues?.length), true)
})

test('Config accepts an optional proxyUrl', () => {
  const empty = Config['~standard'].validate({})
  assert.equal(empty.issues, undefined)
  assert.equal(empty.value.proxyUrl, undefined)
  const set = Config['~standard'].validate({ proxyUrl: 'http://127.0.0.1:7890' })
  assert.equal(set.issues, undefined)
  assert.equal(set.value.proxyUrl, 'http://127.0.0.1:7890')
})
