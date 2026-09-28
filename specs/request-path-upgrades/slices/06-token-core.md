# 06 令牌生命周期核心（F4a–c）

**波次** W2。**依赖**：02b。**PR**：1 个。

## 解锁的契约

- 超时后才成功的换票，结果照样保存，不会因此把用户登出。
- 令牌已过期、刷新端点又一直失败时，不会每个请求都去打一次端点。
- 只有真正的永久失败才删登录：结构化的 401，或者明确的 `invalid_grant` 一类错误码。
  403、429、5xx，以及消息文本里碰巧出现的数字，都不算。

## 接缝

所有改动都在 `src/oauth/tokens.ts`，由 `TokenManager` 统一负责刷新语义。

- **错误类型搬家。** 把 `OAuthEndpointError` 和 `oauthError` 从 `codex/index.ts:256-281` 搬到
  `tokens.ts`。grok、kimi、copilot、cline、anthropic、codex 的 import 跟着改。
- **永久失败判定只有一个出口。**
  - 新增 `isPermanentRefreshFailure(error, extraCodes?)`。以下情况算永久，其余一律不算：
    - status 是 401；
    - code 属于 `invalid_grant`、`invalid_client`、`unauthorized_client`，或调用方传入的
      `extraCodes`；
    - 从结构化 401 设出的 `error.permanent === true`。
  - 各家族谓词都收缩成「额外错误码」：`isCopilotPermanentRefreshError`
    （`copilot/index.ts:545`），以及 kimi（约 L300）、cline（约 L312）、devin（约 L217/226）、
    cursor（约 L472）、kiro。
  - Devin、Cursor、Kiro 改为抛带类型状态码的错误，不再用正则去扫消息文本。
  - Cursor 的「refresh token 已知失效」标记，只在永久失败时才打。
- **迟到的换票结果。**
  - `#refresh` 在调用 `waitFor` 之前，就给原始 promise 挂上持久化。迟到的成功结果经
    `updateAccountSession` 写回；它带版本守卫，所以不会复活已登出或已被替换的账号。
  - 迟到的永久失败也不删登录。
  - 某个版本的换票还没结束时，不为同一版本发起第二次换票。未决状态最多保持
    `REFRESH_LATE_CAP_MS = 120_000`；promise settle 后立即清除。
- **过期令牌的负缓存。** 新增 `REFRESH_EXPIRED_RETRY_MS = 10_000`：令牌已过期时，10s 内直接
  重放上一次的失败，不再打端点；刷新成功或凭据更新后清掉。仍然有效的令牌沿用现有的
  5 分钟退避。这不是 09-26 删掉的那个 5 分钟锁死。

## 能跑 / 能看见

`test/token-lifecycle.test.ts` 里的故障注入用例（见下）。

## 验证门禁

`test/token-lifecycle.test.ts`：
- **慢换票，超时后才成功**：轮换后的 refresh token 被保存，旧 token 只被兑换一次，没有调用
  `deleteSession`。
- **换票挂死**：上限（120s）到达前不会发起第二次换票；到达后才允许重新发起。
- **过期令牌加失败端点**：10s 内 5 次调用只触发 1 次换票。改写 L424 的「总是重试」用例。
- **表驱动测试**，覆盖所有家族谓词：
  - 403 带 "rate limit" 算临时失败；
  - 401 和 `invalid_grant` 算永久失败；
  - 响应体里带 "403" 字样的 5xx 算临时失败。
- 登出、切换账号、inflight 清理这几组现有用例保持绿色。

## 活测

不做。活测进程不能刷新令牌。合入后被动观察：宿主下一次自然刷新时，日志里没有异常的
登出。

## 下放给实施者的决定

内部状态怎么存、常量叫什么（上面这些数值不许改）。

## 必须保持绿色

`npm test`、`test/token-lifecycle.test.ts` 其余用例、各家族登录测试。

## 会改变本 slice 的反馈

如果观察到某家族在 401 之外还有明确的永久错误码（例如 `refresh_token_reused`），把它加进
该家族的 `extraCodes`，并在 README 里写明来源。
