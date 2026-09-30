# Sign in with ChatGPT

本文件是 `src/oauth/chatgpt/` 的设计源。改登录、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

OpenAI 官方给开源客户端的 ChatGPT 套餐共享流程（[developers.openai.com/siwc/token-sharing-open-source](https://developers.openai.com/siwc/token-sharing-open-source)）。
**不是** Codex 家族：Codex 借用 Codex CLI 的 client_id 打 `chatgpt.com/backend-api`；本家动态注册自己的 client，只打公开 `api.openai.com/v1/responses`。两家并存，缓存、会话 id、头互不共用。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 端点、授权 URL、回调 client_id 校验、换票、ID token 验签（JWKS）、刷新、撤销、上游头 |
| [`host.ts`](host.ts) | `chatgpt.json`（0600，挨着 auth.json）：本机 `ext_agent_host_id` 与各注册（client_id → subject / email / 库键）。不存 token |
| [`accounts.ts`](accounts.ts) | 登录发起（注册 / 复用注册）、回调完成、登出撤销、活目录发现 |
| [`request.ts`](request.ts) | 剥不支持字段、`system` → `developer`、`store:false` + `stream:true`、用量上限 → 额度错误 |
| [`cache.ts`](cache.ts) | `prompt_cache_key` ← DSH `prompt_cache_key` / `session_id`，缺省 `dsh-chatgpt`；不发任何亲和头 |
| [`catalog.ts`](catalog.ts) | `GET api.openai.com/v1/models`（按账号）；静态行做离线下限 |

调度：[`../proxy.ts`](../proxy.ts) `/chatgpt/v1/responses` → [`../proxy-body.ts`](../proxy-body.ts) `family === 'chatgpt'` → `forward()` 到 `CHATGPT_RESPONSES_URL`，`classifyFailure: chatgptQuotaFailure`。

## 登录

| 项 | 值 |
|---|---|
| authorize | `https://auth.openai.com/api/accounts/authorize` |
| token | `https://auth.openai.com/api/accounts/oauth/token`（表单，无 secret） |
| revoke | `https://auth.openai.com/api/accounts/oauth/revoke`（OIDC discovery `revocation_endpoint`） |
| 首次 `client_id` | `dynamic_agent_client` + `agent_name_hint=DSH OAuth Subs` |
| 之后 `client_id` | 回调颁发的 `oaiapp_…`，换票 / 刷新 / 撤销 / 再授权都用它 |
| `ext_agent_host_id` | `urn:uuid:<v4>`，首登前生成并持久化，每次都发 |
| scope | `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct` |
| `resource` | `https://api.openai.com/v1`（授权、换票、刷新都带） |
| 回调 | `http://127.0.0.1:<1455 或随机>/auth/callback`，**不是** `localhost` |
| PKCE / state / nonce | 每次新生成；nonce 用于 ID token 校验 |

流程：`loginChatgpt` → 浏览器 → 回调带 `code` + `client_id` → `chatgptCallbackClientId`（注册必须恰好一个 `oaiapp_`；再授权可省略但不能换）→ `redeemChatgptCode`（换票 + RS256 验签，iss / aud = 颁发 id / exp / nonce，再授权校验 `sub` 不变）→ 记注册 → 检查授予 scope 含 `chatgpt.tokens.use.direct` → 存 session。

- **拒绝授权套餐**：注册保留，session 不存，卡片报错请用户重新登录并允许。
- **再授权**：登录时若有未挂 session 的注册（登出过、refresh 死掉），复用它的 client_id，不带 `agent_name_hint`；`mode: 'new'` 强制新注册（另一账号 / 工作区）。
- **库键**：`<email>#<sha256(client_id) 前 8 位>`——同一邮箱可有多个工作区注册，必须分开。
- **刷新**：表单 `grant_type=refresh_token` + 颁发 client_id + `resource`，不带 scope；refresh token 轮换；尊重 `earliest_refresh_at`（仍有效就继续用）。永久失败码：共享码 + `invalid_refresh_token` / `token_expired` / `refresh_token_{expired,invalidated,reused}`；刷新后授予里没有 `chatgpt.tokens.use.direct` 也按永久失败。
- **登出**：先撤销 refresh token（200 = 成功，5xx / 网络错误退避重试 3 次），再删本地；未确认则提示去 ChatGPT 设置断开。注册保留。
- **公开 session**：只有 email / 套餐 / 过期时间；client_id、subject、scope、token 不出库。

## 对话

DSH `api: openai-responses`，`baseURL` = `${origin}/chatgpt/v1`。

```text
DSH  →  本机 /chatgpt/v1/responses  →  POST api.openai.com/v1/responses
        Authorization: Bearer <access_token>
```

请求体（preview-limitations）：`store:false`、`stream:true`；剥 `background conversation max_output_tokens max_tool_calls metadata moderation multi_agent prompt prompt_cache_retention prompt_cache_options safety_identifier temperature top_logprobs top_p truncation user previous_response_id service_tier`（`-fast` 行再补 `service_tier: priority`）；`{type:"message", role:"system"}` 改 `developer`（位置不动，前缀不变）。

`subscription_sharing_usage_limit_exceeded`（429）→ `quotaFailure`（宿主 QUOTA_EXCEEDED，不重试），附 [ChatGPT 设置 → 用量](https://chatgpt.com/settings/usage)。其余错误原样转发。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"chatgpt"` 键。静态行 = Codex 家族 `visibility: list` 行的 `id / name / contextWindow / maxTokens / input / reasoningEfforts`（同一套 GPT 模型，窗口取 Codex CLI 可用输入 258K）。运行时以 `GET /v1/models` 为准：只收 `visibility: "list"`，`slug` 为 wire id、`display_name` 为名；新 slug 没有窗口来源（静态行或活行 `context_window`）就不收，不发明数字。

- **Fast**：`fastTier` 行派生 `<id>-fast`，请求时剥成 `<id>` + `service_tier: "priority"`（`peelChatgptFast`，本家自管，不走 Codex 的 `applyFastMode` / routing-hint）。2026-09-30 活测 `gpt-5.6-luna` 交替 6 次：85.8 vs 56.4 tok/s（1.52×），TTFT 2.1s vs 3.3s；回显仍是 `default`（与 Codex 相同，不是确认）。8 行都 200 接受 `priority`。`fastTier` 取自 Codex 同 id 行；目录外的新 slug 不给 `-fast`，直到测过。其它 tier 一律剥掉（官方：不支持的 tier 覆盖报 `subscription_sharing_unsupported_capability`）。费率 `-fast` = models.dev `vercel` priority 价。
- **不带 `maxContextWindow`**：872K 是 Codex 后端的 `max_context_window`，本路由未见出处。
- 2026-09-30 活测：`/v1/models` 回 `gpt-6-astra / gpt-5.6-sol / -terra / -luna / gpt-5.5`（`visibility: list`，`context_window` 272000）+ 两条 `hide`；静态行里的 `gpt-6.1-sol / gpt-6-sol / gpt-6-luna` 不在列表但请求都 `response.completed`，所以发现结果 = 目录外的新活行（置顶）+ 静态目录全部行（新→旧，活行字段覆盖）。

费率：`src/catalog/rates.json` `"chatgpt"` = models.dev `openai`（公开 API 价，`scripts/rates.ts`），仅展示。

## 额度

没有额度端点：siwc 文档只给 [ChatGPT 设置 → 用量](https://chatgpt.com/settings/usage)，且禁止本家 token 打 `chatgpt.com/backend-api`（所以不能读 `wham/usage`、不能用重置卡）。2026-09-30 活测：响应头没有限额头，SSE 没有 `codex.rate_limits` 帧；access token 的 `https://api.openai.com/auth` 只有 `per_user_salt` + `encrypted_auth_metadata`，ID token 不带 `chatgpt_plan_type`，所以也没有套餐徽章。卡片只显示「管理用量」链接。本家用量与 Codex 窗口是否同一池子未验证。

## 不要

- 不要把 `dynamic_agent_client` 存成连接的 client_id，也不要拿它换票 / 刷新。
- 不要把回调写成 `localhost` 或改 path；只能换端口。
- 不要打 `chatgpt.com/backend-api`，不要发 Codex 的 `session-id` / `thread-id` / `chatgpt-account-id` / `originator` / `x-codex-*`。
- 不要每次登录都新注册 client；也不要每次都 `prompt=consent`（只在用户明确重新开启套餐使用时）。
- 不要把 access / refresh / ID token 写进 URL 或日志（`id_token_hint` 只发给授权端点）。
- 不要只凭有效 ID token 就开放推理；必须看授予的 `chatgpt.tokens.use.direct`。

## 归因

一线：OpenAI 官方文档 [Sign in with ChatGPT · token sharing for open-source](https://developers.openai.com/siwc/token-sharing-open-source)（sign-in / profiles-and-sessions / models-and-inference / token-reference / errors-and-recovery / preview-limitations，2026-09-30 读取）。

| 抄 | 出处 | 本 hop |
|---|---|---|
| 动态注册 + 颁发 client_id 贯穿 | siwc sign-in；earendil-works/pi `packages/ai/src/auth/oauth/openai-chatgpt.ts` @ `02eed88` | `chatgptFlow` / `chatgptCallbackClientId` |
| 回调 client_id 只能一个、再授权不可替换、`oaiapp_` 形状 | openclaw/openclaw `extensions/openai/token-sharing-oauth.runtime.ts` @ `2079ed9` | `chatgptCallbackClientId` |
| ID token JWKS 验签、aud/azp/nonce、账号不可变 | openclaw 同上；pingdotgg/t3code `apps/server/src/provider/CodexChatGptAuth.ts` @ `27bdf1a` | `verifyChatgptIdToken` / `redeemChatgptCode` |
| host id `urn:uuid:`、注册跨登出保留、`earliest_refresh_at`、撤销重试 | t3code 同上 | `host.ts` / `refreshChatgpt` / `revokeChatgpt` |
| 剥不支持字段、用量上限提示 | pi `packages/ai/src/api/openai-responses.ts` `isChatGPTSignIn`；siwc preview-limitations | `request.ts` |

**不要发明：** 官方文档未列、上面三家都不发的头或参数（installation-id、自定义 UA 指纹等）。
