# Grok OAuth

本文件是 `src/oauth/grok/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

**不是** OpenAI Responses。上游是 xAI `api.x.ai/v1/responses`，登录对齐 Grok CLI。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | OIDC 发现、device/PKCE、换票、刷新、Responses 头、套餐档位 |
| [`device-flow.ts`](device-flow.ts) | RFC 8628 设备码（默认登录，无 loopback） |
| [`credits-frame.ts`](credits-frame.ts) | grok.com `GetGrokCreditsConfig` 的 gRPC-web 帧解码 |
| [`reset-frame.ts`](reset-frame.ts) | grok.com 重置卡 `GetRemainingResets` / `RedeemReset` 的 gRPC-web 编解码 + 公开卡 id 哈希 |
| [`request.ts`](request.ts) | DSH Responses body：钉 leading system，多余 snapshot 挂 **input 后缀**；真 Fast id（`grok-4.7-build-fast`）原样透传、残留 `-fast` 别名剥掉、`service_tier` 永不发。不抬顶层 `instructions` |
| [`cache.ts`](cache.ts) | `prompt_cache_key` + grok-build 头（`x-grok-conv-id` / `session-id` / `req-id` / `model-override`）。禁止带 Codex `session-id` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'grok'` → `normalizeGrokResponsesBody` + `applyGrokCache` + `grokAffinityHeaders`。
额度：[`quota.ts`](quota.ts) `fetchGrokQuota` / `parseGrokBilling` / `applyGrokCreditsSnapshot`；重置卡 `fetchGrokResetTokens` / `consumeGrokResetToken`。
套餐：[`../plan.ts`](../plan.ts) + `GROK_TIER_NAMES`（JWT 数字档 0–7）。

## 登录

默认 **设备码**，浏览器不回 127.0.0.1。PKCE loopback `127.0.0.1:56121` `/callback` 是后备。

| 项 | 值 |
|---|---|
| `client_id` | `b1a00492-073a-47ea-816f-4c329264a828` |
| discovery | `https://auth.x.ai/.well-known/openid-configuration`（主机必须是 `x.ai` / `*.x.ai`） |
| UA | `grok-cli/0.2.93` |
| scope | `openid profile email offline_access grok-cli:access api:access` |

入口：`grokDiscovery` → `grokDeviceSpec` / `grokFlow` → `completeGrokDevice` / `exchangeGrokCode` → `grokSession`。
导入：[`../import-auth.ts`](../import-auth.ts) `importGrokAuth` 扫 Grok CLI 凭证路径。

## 对话

DSH `api: openai-responses`。上游就是 xAI `api.x.ai/v1/responses`。不要改 Completions / Anthropic。

```text
DSH  →  本机 Responses 代理  →  POST https://api.x.ai/v1/responses
```

头：`grokUpstreamHeaders` + grok-build `GrokRequestHeaders`（`x-grok-conv-id`、`x-grok-session-id`、`x-grok-req-id`、`x-grok-model-override`；重试再加 `x-grok-transient-retry`）。**不要**抄 Codex 的 `session-id` / `x-client-request-id`：xAI 忽略它们，缓存会打到错误分片。

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"grok"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

最近核对：2026-09-30，`GET cli-chat-proxy.grok.com/v1/models`（grok CLI 自己的列表，`~/.grok/models_cache.json` 同源）；本次 4.5 / 4.6 的 `context_window` 也降到 256K，与 4.7 同口径（2026-09-29 只改了 4.7，4.5 / 4.6 当时源里还报 500K）。

来源字段：`context_window` → `contextWindow`，`reasoning_efforts[].value` → `reasoningEfforts`（思考关不掉，没有 `off`）。`GET api.x.ai/v1/models` 是 API 目录，不是订阅 picker，只作对照。输入窗取**非 Max Mode 基础窗**，不取缓存里的 Max Mode 变体窗口（与 Cursor 家族同一归因，见 `src/oauth/cursor/README.md`；经过见 [`docs/error.md`](../../../docs/error.md) 2026-09-29 Grok 4.7 输入窗口）。列表不带输出上限，`maxTokens` 沿用行值。`grok-4.7-build-fast` 是真后端变体（2× 价），不是 `-fast` 后缀；`grok-4.7-fast` 上游 404。Grok 4 已下架。

## 额度

两条源，缺一不可：

1. `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` + `/v1/user?include=subscription` → `parseGrokBilling`（周期用量、预付、产品行、档位）。
2. `POST https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig`（gRPC-web）→ `decodeGrokCreditsFrame`。统一计费的 SuperGrok / X Premium+ 在 JSON billing 里经常没有 `creditUsagePercent`，这个帧才有周池。周期在 nested field 8 `{type, start, end}`（field 1 不带 usage）；proto3 省略零值 = 0% 已用（与 grok.com 网页一致）。

重置卡（「重置卡」，类 Codex reset credits / GLM 重置卡）：grok CLI 里没有（1.0.44 二进制搜不到这组 RPC），挂在 grok.com 网页计费服务，同一把 CLI bearer + gRPC-web 头（`grokResetHeaders`）即可。

- 列表：`POST grok.com/prod_mc_billing.ConsumerUiSvc/GetRemainingResets`，空请求帧。回 repeated field 10 = token；token 内 10 = id（`restok_…`）、20 = 发放、30 = 过期（Timestamp）——出处 stablyai/orca #18116 的真实抓包 hex；OmniRoute dd263fe 注释写 1/2/3 裸秒，两种形都解。空 DATA 帧 + `grpc-status 0` = 真 0 张；非 0 状态 / HTTP 失败 = 读失败，`resetCredits` 不写，保留上次卡数。
- 兑换：`POST …/RedeemReset`，`ConsumerRedeemResetReq.token_id` = field 10。`0` 成功；`9` 且含 "already" = 这张已兑（丢响应后的重试，按成功算）；其余 `9` 或 `3` "token_id" = 没这张卡（`GrokResetRejected`）。
- 一张卡清周池（和 Codex 一样只有「每周窗口」一行）。
- token id 持有即可兑换，**不出宿主**：公开卡 id 是 `grokResetCardId`（sha256 前 16 位），兑换时重读列表按哈希找回 token，列表里没有就拒绝，不会换一张别的卡花掉。
- 活测 2026-09-29（desktop 两个 SuperGrok 账号）：列表 200 + `grpc-status 0` + 空帧 = 0 张；过期 token 回 header `grpc-status 7`（凭据无效）。兑换未活测（无卡）。

金额字段全部是 `{ val: <cents> }`（CodexBar `x.ai/billing` 文档口径）：`monthlyLimit` + `usage.includedUsed/totalUsed` = 月度包含池，`onDemandCap`/`onDemandUsed` = 按需消费封顶，`prepaidBalance` = 预付余额 —— 统一计费账号（SuperGrok / X Premium+）这些字段全是 `{val:0}` 或不发，**只有裸百分比**；非统一计费账号才有美元数。`{val}` 形才按美分转 USD（`unit:'usd'`），裸数字照旧当无单位 credits。周期 type 映射：MONTHLY→cycle、DAILY→primary(24h)、其余→weekly。`hasGrokCodeAccess` 渲染成卡片上的 `Grok Code` 标。`x.ai/billing` JSON-RPC 只接在 TUI 里（agent stdio 1.0.41 仍 -32601），别当数据源加。gRPC 帧 nested field 7 = `{type, f32}` 语义未考（疑产品/周期子项），fields 11/13 是 flag —— 不解不画。

档位：JWT / user `subscription_tier` 数字 → `GROK_TIER_NAMES`（Free / SuperGrok / X Basic / X Premium / X Premium+ / SuperGrok Heavy / Lite / Plus）。`SuperGrokPro` 显示 **SuperGrok Heavy**。

## 缓存

对照 grok-build（`xai-org/grok-build` Responses）：分片粘滞 **和** 字节前缀都要。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `grokConversationId` | 清洗 DSH `prompt_cache_key` / `session_id`；都空则 `dsh-grok` |
| 2 | `pinGrokSystemPrefix` | 每个 conv id 钉住第一次的 leading system/developer；后续改写只取**变化区域**（最长公共前后缀夹出、外扩到整行）当 extra，禁止整块重挂。共享不到较短文本一半 = 另一个 prompt（DSH 标题请求与主对话同 key），重钉原样发，不挂后缀 |
| 3 | `normalizeGrokResponsesBody` | 钉住的前缀放 `input` 最前（`role: system`）；DSH 多出来的快照挂 **input 后缀** developer。不抬成顶层 `instructions`（grok-build 发 `instructions: null`） |
| 4 | `applyGrokCache` | body `prompt_cache_key` = conv id；删 `session_id` / `prompt_cache_retention` |
| 5 | `grokAffinityHeaders` | `x-grok-conv-id` = `x-grok-session-id` = conv id；每请求一个 `x-grok-req-id`；`x-grok-model-override`；重试 `x-grok-transient-retry` |

判定：后面一块 **512 token** 的 cache 且复用 < 10% = **affinity miss**（打到错误分片），不是前缀被改写。分析器标签在 `src/utils/analyze-session.ts`，不要把 GLM 的 576 token 残骸当成这件事。

健康长会话：加权命中 ≥ 80%，**零** affinity miss。压缩 / 计划重建造成的 0 命中不是分片 miss。

## 不要

- 不要给 Grok 写 Codex `session-id` / `x-client-request-id`。
- 不要把 DSH 每步 snapshot 留在 `input` 最前（grok-build：下一次必须 byte-for-byte 重放前缀）。
- 不要把 Grok 4 加回目录。
- 不要把 `grok-4.7-build-fast` 当 Codex `-fast` 后缀剥掉（会变成不存在的 `grok-4.7-build`）；不要发明 `grok-4.7-fast`（上游 404）。
- 不要只用 billing JSON 填额度条（Heavy / Premium+ 会空）。
- 不要把 `api` 改成 Completions / Anthropic。

## 归因

一线：[xai-org/grok-build](https://github.com/xai-org/grok-build) 的 Responses 路径；UA 钉 `grok-cli/0.2.93`。导入旁路：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) 的 `~/.hermes/auth.json`。

| 抄 | 出处 | 本 hop |
|---|---|---|
| `x-grok-conv-id` / `x-grok-session-id` / `x-grok-req-id` / `x-grok-model-override`，重试加 `x-grok-transient-retry` | grok-build `GrokRequestHeaders` | `grokAffinityHeaders` |
| 模型页价格徽标（USD / 1M） | models.dev `xai`（xAI API 标价）；`grok-4.7-build-fast` 源里没有，按基础行 × 2 派生（乘数出处：上游 picker 对 Fast 的自述 "Fast variant. 2x the price."，见 [`docs/error.md`](../../../docs/error.md) 2026-09-22） | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| `instructions: null`，前缀 byte-for-byte 重放 | grok-build | `normalizeGrokResponsesBody` 不抬顶层 `instructions` |
| 设备码默认 | grok-build | [`device-flow.ts`](device-flow.ts) |
| 目录（窗口、efforts、真 Fast id） | `GET cli-chat-proxy.grok.com/v1/models` | `GROK_MODELS`；真 Fast id 由 `normalizeGrokResponsesBody` 原样透传 |
| 重置卡 `ConsumerUiSvc/GetRemainingResets` / `RedeemReset`（grok.com 网页，CLI 没有） | [stablyai/orca#18116](https://github.com/stablyai/orca/pull/18116) 抓包 + [OmniRoute dd263fe](https://github.com/diegosouzapw/OmniRoute/commit/dd263fed66da50e50e706195f1734e665d61e268) 状态映射 | [`reset-frame.ts`](reset-frame.ts) + `quota.ts` `fetchGrokResetTokens` / `consumeGrokResetToken` |

**不要发明：** 自造的 grok-shell UA——保持 `grok-cli/0.2.93`。Codex 头与 Fast id 的禁令见「不要」。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
