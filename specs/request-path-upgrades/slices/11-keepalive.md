# 11 出站连接保活 60s（F9 fetch 部分）

**波次** W3。**依赖**：02b。**PR**：1 个。

## 解锁的契约

空闲 60s 以内的上游连接可以复用。今天服务端不发 `Keep-Alive` 提示时，连接空闲约 4s 就被
丢掉，下一个请求要重新握手。本机实测 chatgpt.com 握手约 1.7s，ollama.com 约 0.5s。按跨会话
统计，请求前空闲超过 4s 的占比：codex 14%，其余家族 10–16%。

## 接缝

- `src/utils/outbound.ts`：直连的 `Agent` 和 `ProxyAgent` 都设置
  `keepAliveTimeout: 60_000` 和 `keepAliveMaxTimeout: 600_000`。只改这一个地方。
- 陈旧 socket 的保护不另写代码：如果 POST 在拿到响应之前就遇到 ECONNRESET 或
  `UND_ERR_SOCKET`，04 已经会把它当作输出前的传输故障来重试。本 slice 只加一个测试确认这一点。

## 能跑 / 能看见

`assets/repro/keepalive-idle.mjs` 改走 `outboundFetch`：间隔 6s 发两次请求，服务端只看到
1 个连接。

## 验证门禁

- `test/outbound.test.ts`：本地服务端不发 Keep-Alive 头，间隔 6s 发两次请求，只建立 1 个连接。
  `keepAliveTimeout` 在测试里注入，不用真等 60s。
- `test/upstream.test.ts`：复用的 socket 遇到 ECONNRESET 时，会在输出前重试一次，并且成功。

## 活测

Codex `GET /models` 在第 0s、30s、55s 各发一次，最多 3 次。用
`diagnostics_channel.subscribe('undici:client:connected')` 计连接数，应为 1。

## 下放给实施者的决定

无。

## 必须保持绿色

`npm test`，02b 的防火墙测试。

## 会改变本 slice 的反馈（交给 15）

- 复测时 ECONNRESET 和 socket 类重试（按每 1k 次调用计）比基线高：把保活降到 30s，并记进
  error.md。
- codex 和 grok 的 `coldPenaltyMs` 没有下降：在 README 里注明收益不明显，但保留这项改动，
  因为它没有坏处。
