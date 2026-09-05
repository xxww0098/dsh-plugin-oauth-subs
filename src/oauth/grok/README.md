# Grok OAuth

本文件是 `src/oauth/grok/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

**不是** OpenAI Responses。上游是 xAI `api.x.ai/v1/responses`，登录对齐 Grok CLI。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | OIDC 发现、device/PKCE、换票、刷新、Responses 头、套餐档位 |
| [`device-flow.ts`](device-flow.ts) | RFC 8628 设备码（默认登录，无 loopback） |
| [`credits-frame.ts`](credits-frame.ts) | grok.com `GetGrokCreditsConfig` 的 gRPC-web 帧解码 |
| [`request.ts`](request.ts) | DSH Responses body：钉 leading system，多余 snapshot 挂 **input 后缀**。不抬顶层 `instructions` |
| [`cache.ts`](cache.ts) | `prompt_cache_key` + grok-build 头（`x-grok-conv-id` / `session-id` / `req-id` / `model-override`）。禁止带 Codex `session-id` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'grok'` → `normalizeGrokResponsesBody` + `applyGrokCache` + `grokAffinityHeaders`。
额度：[`../quota.ts`](../quota.ts) `fetchGrokQuota` / `parseGrokBilling` / `applyGrokCreditsSnapshot`。
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

模型：`GROK_MODELS` 只有 **Grok 4.6**（`low`–`xhigh`）和 **Grok 4.5**（`low`–`high`）。Grok 4 已下架。思考关不掉。

## 额度

两条源，缺一不可：

1. `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` + `/v1/user?include=subscription` → `parseGrokBilling`（周期用量、预付、产品行、档位）。
2. `POST https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig`（gRPC-web）→ `decodeGrokCreditsFrame`。统一计费的 SuperGrok / X Premium+ 在 JSON billing 里经常没有 `creditUsagePercent`，这个帧才有周池。

没有 Codex 那种重置卷 API。卡片不显示「重置额度」。

档位：JWT / user `subscription_tier` 数字 → `GROK_TIER_NAMES`（Free / SuperGrok / X Basic / X Premium / X Premium+ / SuperGrok Heavy / Lite / Plus）。`SuperGrokPro` 显示 **SuperGrok Heavy**。

## 缓存

对照 grok-build（`xai-org/grok-build` Responses）：分片粘滞 **和** 字节前缀都要。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `grokConversationId` | 清洗 DSH `prompt_cache_key` / `session_id`；都空则 `dsh-grok` |
| 2 | `pinGrokSystemPrefix` | 每个 conv id 钉住第一次的 leading system/developer |
| 3 | `normalizeGrokResponsesBody` | 钉住的前缀放 `input` 最前（`role: system`）；DSH 多出来的快照挂 **input 后缀** developer。不抬成顶层 `instructions`（grok-build 发 `instructions: null`） |
| 4 | `applyGrokCache` | body `prompt_cache_key` = conv id；删 `session_id` / `prompt_cache_retention` |
| 5 | `grokAffinityHeaders` | `x-grok-conv-id` = `x-grok-session-id` = conv id；每请求一个 `x-grok-req-id`；`x-grok-model-override`；重试 `x-grok-transient-retry` |

判定：后面一块 **512 token** 的 cache 且复用 < 10% = **affinity miss**（打到错误分片），不是前缀被改写。分析器标签在 `src/utils/analyze-session.ts`，不要把 GLM 的 576 token 残骸当成这件事。

健康长会话：加权命中 ≥ 80%，**零** affinity miss。压缩 / 计划重建造成的 0 命中不是分片 miss。

## 不要

- 不要给 Grok 写 Codex `session-id` / `x-client-request-id`。
- 不要把 DSH 每步 snapshot 留在 `input` 最前（grok-build：下一次必须 byte-for-byte 重放前缀）。
- 不要把 Grok 4 加回目录。
- 不要只用 billing JSON 填额度条（Heavy / Premium+ 会空）。
- 不要把 `api` 改成 Completions / Anthropic。

## 追溯

| 问题 | 记录 |
|---|---|
| Grok 缓存命中率低 / 错分片 | [`docs/error.md`](../../../docs/error.md) 2026-08-30 Grok 缓存；2026-08-31 缓存混用 |
| xAI 额度拿不到 | 同文件 xAI 额度 |
| Fast 无加速 | 同文件 2026-08-30 Grok/Codex Fast |

测试：`test/proxy.test.ts`（Grok hop 必须带 grok-build 头、禁止 Codex session 头）、`test/cache-families.test.ts`、`test/grok-request.test.ts`。
