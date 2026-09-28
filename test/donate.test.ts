import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { donateQr } from '../lib/utils/donate.js'

// The 感谢 tab pastes the maintainer's payment codes. They ship as real files
// in the package (assets/donate/ is a `files` entry) and reach the workbench
// as data URIs over the `donate` RPC — the client bundle is a classic script
// with no static-file channel of its own.

test('donateQr serves the packaged payment codes as data URIs', async () => {
  const codes = await donateQr()
  for (const key of ['wechat', 'alipay']) {
    assert.match(codes[key] ?? '', /^data:image\/jpeg;base64,/, `${key} QR missing from assets/donate/`)
    assert.ok((codes[key] ?? '').length > 10000, `${key} QR looks truncated`)
  }
  // The images are read once and memoized.
  assert.equal(await donateQr(), codes)
})

test('the donate tab is wired: RPC method, PageTab, and lazy fetch on open', async () => {
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(index, /donate: \(\) => donateQr\(\)/)

  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /tabDonate: '感谢'/)
  assert.match(src, /tabDonate: 'Thanks'/)
  assert.match(src, /id: 'donate', label: t\.tabDonate/)
  assert.match(src, /panel\('donate', h\(DonatePanel/)
  assert.match(src, /active: view === 'donate'/)
  // Family rail is quota/models only; donate renders without it.
  assert.match(src, /\(view === 'quota' \|\| view === 'models'\) && h\('div', \{ className: 'osubs-rail' \}/)
  // Stale host (no donate method) maps to the hostStale copy, not a raw error.
  assert.match(src, /isUnknownOauthMethod\(message\) \? t\.hostStale : message/)
  // React DOM throws on a string `style` prop — a crash that whites out the
  // whole panel. The brand dot must stay a style object.
  assert.match(src, /style: \{ '--osubs-donate-brand': brand \}/)
  assert.equal(/style: `--osubs-donate-brand/.test(src), false)
  // The two source images have different aspect ratios; equal-width rendering
  // left the captions uneven. Fixed height keeps the caption row level.
  assert.match(src, /\.osubs-donate-qr img \{[^}]*height: 320px/)
})
