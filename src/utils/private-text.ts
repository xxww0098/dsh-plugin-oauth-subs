/**
 * Private (0600) text-file helpers shared by the oauth and apikey modules.
 * Extracted from oauth/store.ts so apikey does not import the OAuth store.
 */

import { constants } from 'node:fs'
import { chmod, mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function readPrivateText(path, label, { allowBroadMode = false } = {}) {
  let handle
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    if (error.code === 'ELOOP') throw new Error(label + ' at ' + path + ' must not be a symbolic link')
    throw error
  }
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new Error(label + ' at ' + path + ' must be a regular file')
    if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
      throw new Error(label + ' at ' + path + ' must be owned by the current user')
    }
    if (!allowBroadMode && process.platform !== 'win32' && (info.mode & 0o077) !== 0) {
      throw new Error(label + ' at ' + path + ' must not be accessible by group or other users')
    }
    return await handle.readFile('utf8')
  } finally {
    await handle.close()
  }
}

export async function writePrivateText(path, text) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await chmod(dirname(path), 0o700)
  const tmp = path + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2)
  try {
    await writeFile(tmp, text, { mode: 0o600 })
    await chmod(tmp, 0o600)
    await rename(tmp, path)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}
