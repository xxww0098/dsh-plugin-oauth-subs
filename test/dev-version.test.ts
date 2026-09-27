import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEV_BUILD_FILE,
  devBuildPath,
  nextDevBuild,
  parseDevBuild,
  readDevVersion,
} from '../lib/utils/dev-version.js'

test('parseDevBuild reads a stamp and refuses junk', () => {
  assert.deepEqual(parseDevBuild('{"base":"0.0.105","n":3,"at":"2026-09-26T12:00:00.000Z"}'),
    { base: '0.0.105', n: 3, at: '2026-09-26T12:00:00.000Z' })
  assert.equal(parseDevBuild('{"base":"0.0.105","n":0}'), undefined)
  assert.equal(parseDevBuild('{"n":2}'), undefined)
  assert.equal(parseDevBuild('not json'), undefined)
  assert.equal(parseDevBuild(undefined), undefined)
})

test('nextDevBuild counts within a version and restarts on a new one', () => {
  assert.deepEqual(nextDevBuild(undefined, '0.0.105', 'at'), { base: '0.0.105', n: 1, at: 'at' })
  assert.deepEqual(nextDevBuild({ base: '0.0.105', n: 1 }, '0.0.105', 'at'), { base: '0.0.105', n: 2, at: 'at' })
  assert.deepEqual(nextDevBuild({ base: '0.0.104', n: 7 }, '0.0.105', 'at'), { base: '0.0.105', n: 1, at: 'at' })
})

test('readDevVersion reads the linked tree stamp for the running version', () => {
  const read = (text) => readDevVersion('/repo', '0.0.105', {
    readFileFn: (path) => {
      assert.equal(path, devBuildPath('/repo'))
      assert.ok(path.endsWith(DEV_BUILD_FILE))
      return text
    },
  })
  assert.equal(read('{"base":"0.0.105","n":3}'), '0.0.105-dev.3')
  assert.equal(read('{"base":"0.0.104","n":9}'), undefined)
  assert.equal(read('junk'), undefined)
  assert.equal(readDevVersion('/repo', '0.0.105', { readFileFn: () => { throw new Error('ENOENT') } }), undefined)
  assert.equal(readDevVersion(undefined, '0.0.105'), undefined)
})
