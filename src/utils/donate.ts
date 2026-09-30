import { readFile } from 'node:fs/promises'

const DONATE_FILES = {
  wechat: ['wechat.jpg', 'image/jpeg'],
  alipay: ['alipay.jpg', 'image/jpeg'],
  // The bunny-heart sticker is hand-composed SVG: traced silhouette +
  // redrawn face and pink heart, so it stays sharp at workbench sizes.
  bunny: ['bunny-heart.svg', 'image/svg+xml'],
} as const

let cached: Promise<Record<string, string>> | undefined

/**
 * Payment QR codes shipped in the package under assets/donate/. Read once and
 * handed to the workbench as data URIs — the client bundle is a classic
 * script with no static-file channel of its own. A file missing from a
 * trimmed install just drops that entry.
 */
export function donateQr(): Promise<Record<string, string>> {
  cached ??= (async () => {
    const out: Record<string, string> = {}
    await Promise.all(Object.entries(DONATE_FILES).map(async ([key, [file, mime]]) => {
      try {
        const body = await readFile(new URL(`../../assets/donate/${file}`, import.meta.url))
        out[key] = `data:${mime};base64,${body.toString('base64')}`
      } catch { /* asset not shipped in this install */ }
    }))
    return out
  })()
  return cached
}
