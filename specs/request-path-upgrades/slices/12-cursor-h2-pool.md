# 12 Cursor HTTP/2 连接池（F9 Cursor 部分）

**波次** W5。**依赖**：05e（传输层）、02b（代理解析）。**PR**：1 个。优先级低：本机 30 天只有
8 次 Cursor 调用。

## 解锁的契约

Cursor 的对话和一元 RPC 复用同一条 HTTP/2 连接，不再每次 run 都重新走 TCP、TLS（经代理时
还有 CONNECT）。取消一次 run 仍然会停止上游的工作，但不影响同一连接上的其他 run。

## 接缝

- `src/oauth/cursor/upstream-proxy.ts` 的 `cursorH2Connect`：
  - 按 (origin, proxy) 各保留一个池化会话，并发拨号合并成一次。
  - 以下情况淘汰会话：close、GOAWAY、error、空闲 60s。
  - 会话调用 `unref()`。
  - 配置变化或插件停止时清空连接池。
- `src/oauth/cursor/h2-session.ts`：
  - `runCursorAgent`、`cursorUnaryRpc` 改用池化会话。
  - run 结束或被取消时，用 `stream.close(NGHTTP2_CANCEL)` 只关闭自己的流，不再调用
    `client.destroy()`（约 L173-182）。这样保留了 09-08 的要求（「取消后停止消耗上游」），
    也不会误伤同一会话上的其他 run。
  - 迟到的拨号结果：调用方已经放弃时，这条会话仍然放进池里，但不交给这个调用方。

## 能跑 / 能看见

测试用的 h2 对端能数出会话数和 RST_STREAM 的错误码。

## 验证门禁

`test/cursor-transport.test.ts`，基于 `withH2Peer`：
- 3 次 run 只建立 1 个服务端会话；
- 取消时对端收到 rstCode 8（CANCEL），之后会话仍被复用；
- 收到 GOAWAY 后新开会话；
- 并发 run 互不干扰；
- 握手卡住时受首字节计时约束（05e）；
- 迟到的拨号结果被正确处理。

## 活测

Cursor 连续 2 次 run（最多 3 次），只建立 1 条连接。

## 下放给实施者的决定

池的内部结构。空闲关闭时间可以取 ≤60s 的任意值。

## 必须保持绿色

`npm test`，Cursor 现有的 CONNECT 代理和取消测试。

## 会改变本 slice 的反馈

测到连接池导致 run 之间互相干扰（一个 run 的取消或错误影响到另一个）：只撤掉连接池，05e
和 02b 的改动保留，并在 error.md 里记下来。
