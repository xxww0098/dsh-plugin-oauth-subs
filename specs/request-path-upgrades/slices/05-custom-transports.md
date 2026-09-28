# 05 自定义传输层迁到尝试原语（F2 传输层部分、F5、F4e、决定 5）

五个子 slice（05a–e），各一个 PR，彼此可以并行。**波次** W4。**依赖**：04；05e 还依赖 02b。

## 共同契约（五个子 slice 都要满足）

- 传输层在 `upstreamRequest(...).run` 里执行，自动拿到首字节 120s、空闲 270s、预算 270s 三个
  计时器。每收到一块上游数据就调用 `attempt.touch()`。预算起点 `startedAt` 由 `proxy.ts` 的
  路由 handler 在入口记录并传入，和 04 一样，`tokens.session()` 的等待也计入预算。
- **第一块映射后的输出产生之前，不写响应头。** 今天 Antigravity 在读上游之前就写了头。
- **输出前失败**：抛 `UpstreamFailure`，带真实状态码，由 `answerFailure` 回 JSON 错误。
  状态码规则：
  - Connect 错误码走 `connectCodeStatus`：`unauthenticated`→401、`permission_denied`→403、
    `resource_exhausted`→429、`unavailable`→503、`deadline_exceeded`→504、
    `invalid_argument` / `failed_precondition` / `out_of_range`→400，其余→502。
  - 厂商有自己的状态字段就用它。
- **输出后失败**：直接 `response.destroy(err)`。删掉所有「写一个 SSE 错误块再正常结束」的分支。
- **重试**：只重试传输故障（socket 错、超时、输出前截断）。HTTP 状态和厂商错误负载一律
  不重试（决定 5）。删掉私有的重试循环。
- **401**：输出前遇到 401，通过 `run` 的 `refresh` 钩子调一次 `tokens.refreshNow` 再重试（F4e）。
  `proxy.ts` 要把 `tokens` 传给这些路由。
- **额度耗尽**：已知的额度耗尽响应走家族额度谓词，改成 `usage limit reached: …` 文案。未知的
  厂商码只记录下来，不猜它是额度问题，也不猜它是永久错误。

## 05a Kiro

- `kiro/transport.ts` 接入 `run`：加计时器，删掉头发出后的错误块（约 L141、L191）。
- 输出前的厂商异常继续用 `classifyKiroHopError`（`kiro/request.ts:678`）。
- 月度额度（`MONTHLY_REQUEST_COUNT`）从 400 改为 429，文案用 `usage limit reached:` 前缀。
  宿主因此归为 QUOTA_EXCEEDED，不重试，而且提示得更准确。
- 401/403 先刷新一次再试。刷新后仍然失败，维持现有的 400 映射：订阅本身有效，避免宿主
  显示「API 密钥无效」。
- 测试：`test/kiro-transport.test.ts`：
  - 首帧前卡住 → 504，且没写头。
  - 输出后断流 → destroy。
  - 401 后成功 → 只刷新一次。
  - 月度额度 → 429 + 额度文案。

## 05b Antigravity

- `antigravity/transport.ts` 接入 `run`；写头推迟到第一块输出。
- `antigravity/request.ts`：外层或嵌套的 `body.error` 直接抛出（约 L592、L761），不再以
  `finish_reason: "stop"` 和 `[DONE]` 正常结束。
- 输出前 401 刷新一次（F4e）。URL 回退行为保持不变。
- 测试：`test/antigravity.test.ts`：
  - 卡住 → 504 且没写头。
  - `body.error` 出现在输出前 → 转成对应状态码；出现在输出后 → destroy。
  - 刷新一次后成功。

## 05c Devin

- `devin/transport.ts`：删掉 `runRetrying` 里对 HTTP ≥500 的重放（`devinRetryable`），socket 级
  重试交给 `run`。
- Connect trailer 错误码转成状态码。`user_jwt` 的 401「丢掉缓存再试一次、只用 token」保留，
  它是现有的、有文档的例外。
- `upstreamRequest` 支持按调用覆盖 `timeouts`。本 slice 仍用默认的 120s 首字节；是否把 Devin
  的首字节放宽到整个预算，由 15 按规则决定。
- 测试：`test/devin.test.ts`：
  - 卡住 → 504。
  - HTTP 503 → 原样转发一次，不重放。
  - Connect `deadline_exceeded` → 504。
  - `user_jwt` 重试保持不变。

## 05d Command Code

- `command-code/transport.ts`：删掉 `runRetrying` 和 `commandCodeRetryable`（它会在代理内重放
  429 和 ≥500）。
- 流内错误事件的 `statusCode` 作为回复的状态码，不再一律回 502。
- 测试：`test/command-code.test.ts`：
  - 改写 L403 那组用例：429、5xx 各只转发一次。
  - 流内错误事件带 `statusCode` 时回对应状态码。
  - 卡住 → 504。

## 05e Cursor

- `cursor/transport.ts` 接入 `run`：
  - 首字节计时覆盖「连接建立 + 第一个 DATA 帧」，每一帧都调用 `touch()`。
  - Connect 错误码转成状态码。
- 删掉 `fail()` 里在头发出后写 SSE 错误块的分支（`cursor/transport.ts:64-75`）。
- mapper 遇到「第一个事件就是错误」时，不能先吐出 role 块、把头提交出去。
- 输出前 401 刷新一次（F4e）。
- 本 slice 仍是每次 run 一个 h2 会话；连接池由 12 负责。
- 测试：
  - `test/cursor-transport.test.ts`：对端永远不发 DATA → 504；错误帧出现在输出前 → 对应状态码。
  - 改写 proxy.test 里期望 SSE 错误块的 Cursor 用例：输出后失败改为断流。

## 能跑 / 能看见

每个子 slice 的故障注入测试。可以对着 `assets/repro/stall-budget.mjs` 仿写同样的脚本，指向
该家族的路由；这类脚本可选，不进提交。

## 活测

每个子 slice 对自己的家族各发 1 次正常请求，最多 3 次，确认没有回归。

## 下放给实施者的决定

各家错误文案的措辞（必须通过 04 的宿主分类契约测试）、测试夹具怎么组织。

## 必须保持绿色

`npm test`，以及各家族其余的请求和缓存测试。

## 会改变本 slice 的反馈（非阻塞检查点）

输出后改成 destroy 以后，如果宿主重试导致用户可见的文本重复出现：只把该家族的「输出后」
路径回退成带结构的错误事件，并在 error.md 里记下来，其他家族照做。
