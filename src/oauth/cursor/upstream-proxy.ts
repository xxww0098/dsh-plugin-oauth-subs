/**
 * Optional upstream egress for the Cursor h2 hop. Region-gated providers
 * (Anthropic / OpenAI / Gemini) are refused server-side when the request
 * leaves from an unsupported region; the official client escapes this
 * with VS Code `http.proxy`. This hop honors `PI_CURSOR_PROXY` /
 * `CURSOR_PROXY` (`http://`, `https://`, `socks5://`, optional user:pass).
 * Only the h2 RPC path (agentn Run / GetUsableModels, api2 unary) is
 * tunneled — auth poll, token refresh, and quota JSON stay direct.
 */

import http2 from 'node:http2'
import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { cursorUpstreamProxy } from './index.js'

const DIAL_TIMEOUT_MS = 10_000
const MAX_CONNECT_HEAD = 16 * 1024

/** Buffers socket data so handshake steps can read exact byte counts. */
class Pump {
  declare socket: any
  declare buf: Buffer
  declare waiters: any[]
  declare failed: Error | null
  declare onData: (chunk: Buffer) => void
  declare onError: (error: unknown) => void
  declare onClose: () => void

  constructor(socket) {
    this.socket = socket
    this.buf = Buffer.alloc(0)
    this.waiters = []
    this.failed = null
    this.onData = (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk])
      this.#drain()
    }
    this.onError = (error) => this.#fail(error)
    this.onClose = () => this.#fail(new Error('cursor proxy tunnel closed during handshake'))
    socket.on('data', this.onData)
    socket.once('error', this.onError)
    socket.once('close', this.onClose)
  }

  #fail(error) {
    if (this.failed) return
    this.failed = error instanceof Error ? error : new Error(String(error))
    for (const waiter of this.waiters.splice(0)) waiter.reject(this.failed)
  }

  #drain() {
    for (const waiter of [...this.waiters]) {
      if (this.buf.length < waiter.n) continue
      this.waiters.splice(this.waiters.indexOf(waiter), 1)
      if (!waiter.consume) {
        waiter.resolve(null)
        continue
      }
      const out = this.buf.subarray(0, waiter.n)
      this.buf = this.buf.subarray(waiter.n)
      waiter.resolve(out)
    }
  }

  read(n) {
    if (this.failed) return Promise.reject(this.failed)
    if (this.buf.length >= n) {
      const out = this.buf.subarray(0, n)
      this.buf = this.buf.subarray(n)
      return Promise.resolve(out)
    }
    return new Promise<Buffer>((resolve, reject) => this.waiters.push({ n, consume: true, resolve, reject }))
  }

  /** Wait for at least one more buffered byte without consuming anything. */
  #more() {
    if (this.failed) return Promise.reject(this.failed)
    return new Promise<Buffer | null>((resolve, reject) => this.waiters.push({ n: this.buf.length + 1, consume: false, resolve, reject }))
  }

  async until(marker) {
    for (;;) {
      const at = this.buf.indexOf(marker)
      if (at >= 0) {
        const out = this.buf.subarray(0, at + marker.length)
        this.buf = this.buf.subarray(at + marker.length)
        return out
      }
      if (this.buf.length > MAX_CONNECT_HEAD) {
        throw new Error('cursor proxy CONNECT response header too large')
      }
      await this.#more()
    }
  }

  /** Hand the socket back to the caller: stop consuming, push leftovers back. */
  detach() {
    this.socket.off('data', this.onData)
    this.socket.off('error', this.onError)
    this.socket.off('close', this.onClose)
    // Pause so a leftover tail cannot flush before the TLS layer attaches.
    this.socket.pause?.()
    if (this.buf.length) this.socket.unshift(this.buf)
  }
}

function bareHost(hostname) {
  return String(hostname ?? '').replace(/^\[|\]$/g, '')
}

function dialSocket({ host, port, secure, servername = undefined, timeoutMs }: any) {
  const address = bareHost(host)
  return new Promise<any>((resolve, reject) => {
    const socket = secure
      ? tlsConnect({ host: address, port, servername: bareHost(servername) || address })
      : netConnect({ host: address, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`cursor proxy dial timeout after ${timeoutMs}ms`))
    }, timeoutMs)
    timer.unref?.()
    socket.once(secure ? 'secureConnect' : 'connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function proxyAuthHeader(proxy) {
  const user = decodeURIComponent(proxy.username ?? '')
  if (!user) return ''
  const pass = decodeURIComponent(proxy.password ?? '')
  return `Proxy-Authorization: Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}\r\n`
}

function targetPort(target) {
  return Number(target.port) || (target.protocol === 'https:' ? 443 : 80)
}

async function httpConnectTunnel(proxy, target, timeoutMs) {
  const secure = proxy.protocol === 'https:'
  const socket = await dialSocket({
    host: proxy.hostname,
    port: Number(proxy.port) || (secure ? 443 : 80),
    secure,
    servername: proxy.hostname,
    timeoutMs,
  })
  const pump = new Pump(socket)
  const port = targetPort(target)
  socket.write(
    `CONNECT ${target.hostname}:${port} HTTP/1.1\r\n` +
    `Host: ${target.hostname}:${port}\r\n` +
    proxyAuthHeader(proxy) +
    '\r\n',
  )
  try {
    const head = (await pump.until('\r\n\r\n')).toString('latin1')
    const status = Number(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i.exec(head)?.[1])
    if (!(status >= 200 && status < 300)) {
      throw new Error(`CONNECT ${target.hostname}:${port} answered HTTP ${status || '???'}`)
    }
  } catch (error) {
    socket.destroy()
    throw error
  }
  pump.detach()
  return socket
}

async function socks5Tunnel(proxy, target, timeoutMs) {
  const socket = await dialSocket({
    host: proxy.hostname,
    port: Number(proxy.port) || 1080,
    secure: false,
    timeoutMs,
  })
  const pump = new Pump(socket)
  try {
    const user = decodeURIComponent(proxy.username ?? '')
    const pass = decodeURIComponent(proxy.password ?? '')
    socket.write(Buffer.from(user ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]))
    const [version, method] = await pump.read(2)
    if (version !== 0x05 || method === 0xff) {
      throw new Error('SOCKS5 proxy rejected the offered auth methods')
    }
    if (method === 0x02) {
      const u = Buffer.from(user, 'utf8')
      const p = Buffer.from(pass, 'utf8')
      if (u.length > 255 || p.length > 255) throw new Error('SOCKS5 credentials exceed 255 bytes')
      socket.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]))
      const authReply = await pump.read(2)
      if (authReply[1] !== 0x00) throw new Error('SOCKS5 proxy authentication failed')
    } else if (method !== 0x00) {
      throw new Error(`SOCKS5 proxy requires unsupported auth method ${method}`)
    }
    const host = Buffer.from(bareHost(target.hostname), 'utf8')
    if (host.length > 255) throw new Error('SOCKS5 target host exceeds 255 bytes')
    const port = targetPort(target)
    socket.write(Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
      host,
      Buffer.from([port >> 8, port & 0xff]),
    ]))
    const head = await pump.read(4)
    if (head[0] !== 0x05 || head[1] !== 0x00) {
      throw new Error(`SOCKS5 connect failed (reply ${head[1] ?? '??'})`)
    }
    const atyp = head[3]
    const addrLen = atyp === 0x01 ? 4 : atyp === 0x04 ? 16
      : atyp === 0x03 ? (await pump.read(1))[0] : -1
    if (addrLen < 0) throw new Error(`SOCKS5 reply uses unknown address type ${atyp}`)
    await pump.read(addrLen + 2)
  } catch (error) {
    socket.destroy()
    throw error
  }
  pump.detach()
  return socket
}

function proxyLabel(proxy) {
  try {
    const url = new URL(proxy)
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`
  } catch {
    return 'proxy'
  }
}

/** Raw TCP tunnel to `target` through `proxy` (http/https CONNECT or socks5). */
export async function dialCursorProxy(proxy, target, { timeoutMs = DIAL_TIMEOUT_MS } = {}) {
  const url = proxy instanceof URL ? proxy : new URL(String(proxy))
  const protocol = url.protocol.replace(':', '').toLowerCase()
  if (protocol === 'http' || protocol === 'https') return httpConnectTunnel(url, target, timeoutMs)
  if (protocol === 'socks5' || protocol === 'socks5h' || protocol === 'socks') {
    return socks5Tunnel(url, target, timeoutMs)
  }
  throw new Error(`unsupported cursor upstream proxy scheme "${url.protocol}" (want http://, https://, or socks5://)`)
}

/**
 * `http2.connect` replacement for the Cursor hop. When an upstream proxy is
 * configured the tunnel is dialed first, then http2 attaches over it — the
 * TLS handshake to the Cursor host still happens inside `createConnection`
 * so ALPN/session handling is unchanged. Without a proxy this is a plain
 * `http2.connect`.
 */
export async function cursorH2Connect(url) {
  const proxy = cursorUpstreamProxy()
  if (!proxy) return http2.connect(url)
  const target = new URL(url)
  let tunnel
  try {
    tunnel = await dialCursorProxy(proxy, target)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`cursor upstream proxy ${proxyLabel(proxy)} failed: ${message}`)
  }
  return http2.connect(url, {
    createConnection: () => (target.protocol === 'https:'
      ? tlsConnect({ socket: tunnel, servername: bareHost(target.hostname), ALPNProtocols: ['h2'] })
      : tunnel),
  })
}
