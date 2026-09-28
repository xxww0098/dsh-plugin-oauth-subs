# 13 Codex 请求体 zstd 压缩（F10）

**波次** W4。**依赖**：04（`forward()` 的新参数）。**PR**：1 个。

## 解锁的契约

发往 Codex 的请求体改用 zstd 压缩，减少大上下文请求的上传时间。光系统提示就约 128KB，
长会话的请求体有几百 KB 到 MB 级。

宿主（DSH）自带的 openai-codex provider 已经这样做，它的注释写着：Codex 后端能解码
`content-encoding: zstd`，与官方客户端一致。

## 接缝

- `forward()` 新增路由参数 `encodeBody(buffer) → { body, headers }`，`proxy.ts` 只负责转交
  （符合「proxy.ts 只做分发」的规矩）。
- `src/oauth/codex/request.ts` 实现 `encodeCodexBody`：
  - 用 `zlib.zstdCompressSync` 压缩，并加上 `content-encoding: zstd`。
  - 在尝试循环开始之前只压缩一次，每次重试复用同一份字节。
- 其他家族不传这个参数，行为完全不变。
- 更新 `docs/oauth.md` 的 Codex 行，注明请求体用 zstd。

## 能跑 / 能看见

测试里把上游收到的请求体解压，与原始 JSON 逐字节比对；同时打印压缩前后的大小。

## 验证门禁

- `test/codex-request.test.ts` 或 `test/proxy.test.ts`：
  - 上游收到的请求体能解压回原始 JSON；
  - 请求头里有 `content-encoding: zstd`；
  - 重试时复用同一个 Buffer；
  - 其他家族收到的请求体仍是明文。

## 活测

Codex 流式、非流式各发 1 次。如果后端回 400 或 415，放弃这个 slice，并在 error.md 里记下来，
不做自动退回明文重发。

## 下放给实施者的决定

压缩级别（默认值即可）；是否对很小的请求体跳过压缩。

注意：宿主 Node 24 / CI Node 22 上，zlib 的 zstd 可能打印一次 ExperimentalWarning。这不影响
功能，不需要处理；如果要屏蔽，只屏蔽这一条警告。

## 必须保持绿色

`npm test`，Codex 请求规范化测试和缓存测试。

## 会改变本 slice 的反馈

15 复测时 codex 的 ttfb p50 如果变差（压缩耗费 CPU），降低压缩级别，或设置一个压缩门槛。
