import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { base64url, createPkce, randomHex, randomToken } from '../lib/utils/pkce.js'

test('createPkce mints an S256 pair', () => {
  const pair = createPkce()
  assert.equal(pair.verifier.length > 20, true)
  assert.equal(pair.challenge, base64url(createHash('sha256').update(pair.verifier).digest()))
  assert.notEqual(createPkce().verifier, pair.verifier)
})

test('randomToken and randomHex have the expected alphabet', () => {
  assert.match(randomToken(16), /^[A-Za-z0-9_-]+$/)
  assert.match(randomHex(8), /^[0-9a-f]{16}$/)
})
