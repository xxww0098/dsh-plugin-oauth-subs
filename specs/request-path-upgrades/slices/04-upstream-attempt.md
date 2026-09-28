# 04 上游尝试原语 + `forward()`（F2 主体，决定 5、7）

**波次** W3。**依赖**：03（同在 `proxy.ts`）。**PR**：1 个。

## 解锁的契约

代理自己在宿主 300s 看门狗之前收场，失败以宿主能正确分类的状态码和文案送达：

- 每次尝试，首字节（含响应头）必须在 120s 内到达。
- 输出前的总预算是 270s，从**收到请求**开始计，`tokens.session()` 的等待也算在内。只有
  `已用时间 + 退避 + 120s ≤ 270s` 时才发起下一次尝试；否则回
  `504 <family> upstream: no output within 270s (<n> attempts): <最后一次失败>`。
- 前导帧也算「首字节」。前导之后的静默受 270s 空闲和总预算约束；「只有前导就断流」仍然
  快速重试。
- 非流式请求：首字节窗口 = 剩余预算，因为整段响应一次性到达。
- 输出开始后，空闲 270s 就 `response.destroy(error)`。
- 已发出响应头之后抛出的错误一律 destroy，不再被收成干净的 EOF。

## 接缝

新文件 `src/oauth/upstream.ts`，是计时、预算、重试和失败映射的唯一所有者：

```ts
export const UPSTREAM_TIMEOUTS = { firstByteMs: 120_000, budgetMs: 270_000, idleMs: 270_000 }
export const UPSTREAM_ATTEMPTS = 3
export const RETRY_BACKOFF_MS = [1000, 4000]
export function retryDelayMs(failedAttempt, random?)   // 从 proxy.ts 搬来，抖动不变
export class UpstreamFailure extends RequestError { code; retryAfter?; payload? }
export function upstreamRequest(o: { family, signal, startedAt, stream, timeouts? }): {
  run<T>(fn: (a: Attempt) => Promise<T>, o?: { refresh?: () => Promise<boolean> }): Promise<T>
}
interface Attempt { index; signal; touch(): void; committed(): boolean }
// signal 在客户端断开、首字节超时、空闲超时时中止；
// touch() 每收到一块数据调用一次：第一次调用解除首字节计时并开始计空闲
export function connectCodeStatus(code: string): number    // 由 05 使用
export function answerFailure(response, error): void       // 未发头：回 JSON 错误（透传 retry-after）；已发头：destroy
```

**失败映射**（只有 `upstream.ts` 能决定）：

| 失败 | 输出前 | 输出后 |
|---|---|---|
| socket 故障、只有前导就断流 | 预算够就重试，否则回 502 `<family> upstream failed <n> times: …`（沿用现有文案，分析器的 `proxyExhausted` 依赖它） | destroy |
| 首字节超时、预算耗尽 | 预算够就重试，否则回 504 `… no output within …` | — |
| 空闲 270s | — | destroy |
| 上游 HTTP ≥400 | 原样转发（带 retry-after / retry-after-ms），不重试。例外：401 刷新一次后立即重试；GLM 网关的 401/403/404 回退一次（都是现有行为） | — |
| 家族额度谓词命中（`classifyFailure(status, payload)` 钩子，本 slice 接入 Cline 的 `INFERENCE_CAP_ERROR`） | 429，文案前缀 `usage limit reached: <厂商原文>`，宿主归为 QUOTA_EXCEEDED，不重试 | destroy |
| TokenManager 报「未登录 / 登录过期 / 导入登录已过期」这类不带状态码的错误 | 403，宿主归为 AUTH，不重试 | — |

其余改动：
- `proxy.ts` 的 `forward()` 和 `attemptUpstream` 改用 `run`；`createProxy({ upstreamTimeouts })`
  取代 `upstreamIdleTimeoutMs`；`listen()` 的 catch 改调 `answerFailure`；预算起点 `startedAt`
  在路由 handler 入口记录，传给 `forward()`，05 也照样传给各传输层。
- `tokens.ts`：「未登录」（L94）和「登录过期，请重新登录」（L187）改为抛
  `LoginRequiredError`（`status: 403`，保留原文案）。`answerFailure` 只看 `error.status`，不认
  具体的错误类；07 的 `ImportedLoginStale` 继承这个类。
- 保留在 `forward()`：Codex turn-state 回放、GLM 网关回退、401 刷新一次（立即重试，不付退避）。
- **删除**：`withIdleTimeout`、`UpstreamIdleError`、`UPSTREAM_IDLE_TIMEOUT_MS`、
  `COMMIT_DEADLINE_MS`，以及 `proxy.ts` 里的 `STREAM_ATTEMPTS`、`RETRY_BACKOFF_MS`、
  `retryDelayMs`（不留 re-export，测试改从 `upstream.ts` 导入）。
- `cline/request.ts` 提供 `clineQuotaFailure(status, payload)`，路由处传给 `forward()`。

## 能跑 / 能看见

`assets/repro/stall-budget.mjs` 改用缩放后的 `upstreamTimeouts`：
- 响应头前卡住：2 次尝试后回 504。换算到生产约 245s，在宿主 300s 之前。
- 有头无体：同样在预算内回 504。

## 验证门禁

- 新增 `test/upstream.test.ts`，用 `mock.timers` 覆盖上面每一条规则。
- **宿主分类契约测试**：把 `assets/baseline-2026-09-28.md` 里记录的宿主正则抄进测试
  （`classifyPiAiError` 顺序、`isQuotaExceededError`），断言每种失败文案落到预期的码：
  - SERVER、TIMEOUT、TRANSPORT 会被宿主重试；
  - QUOTA_EXCEEDED、AUTH 不会。
- 迁移 proxy.test 韧性测试块（L739–918，包括 L815–827 的空闲测试），全部改用新参数。
- 三次快速 ECONNRESET 仍然回 502；输出后卡住会被 destroy 且只尝试一次。

## 活测

Codex、Ollama、Cline 各 1 次正常请求，确认没有回归。

## 人工检查点（不阻塞）

在 DSH 里看「未登录 → 403」怎么显示。如果被显示成「API 密钥无效」之类会误导的提示，
改用 409（宿主归为 PI_AI_ERROR，同样不重试），决定写回本文件。约 5 分钟没有回应，就
按截图自己判断。

## 下放给实施者的决定

错误文案的措辞，但必须通过宿主分类契约测试；内部 helper 怎么拆分。

## 必须保持绿色

`npm test`，Codex turn-state 与 GLM 网关回退的现有测试。

## 会改变本 slice 的反馈

合入后的窗口里，如果 Devin/Ollama 原本成功的请求变成 504（首字节超过 120s）：不在本
slice 改默认值，交给 15 按预设规则处理（见 15）。
