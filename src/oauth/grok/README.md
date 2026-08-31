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
| [`cache.ts`](cache.ts) | `prompt_cache_key` + **`x-grok-conv-id`**。禁止带 Codex `session-id` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'grok'` → `applyGrokCache` + `grokAffinityHeaders`。
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

```text
DSH  →  本机 Responses 代理  →  POST https://api.x.ai/v1/responses
```

头：`grokUpstreamHeaders` + `x-grok-conv-id`（有缓存 id 时）。**不要**抄 Codex 的 `session-id` / `x-client-request-id`：xAI 忽略它们，缓存会打到错误分片。

模型：`GROK_MODELS` 只有 **Grok 4.6**（`low`–`xhigh`）和 **Grok 4.5**（`low`–`high`）。Grok 4 已下架。思考关不掉。

## 额度

两条源，缺一不可：

1. `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` + `/v1/user?include=subscription` → `parseGrokBilling`（周期用量、预付、产品行、档位）。
2. `POST https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig`（gRPC-web）→ `decodeGrokCreditsFrame`。统一计费的 SuperGrok / X Premium+ 在 JSON billing 里经常没有 `creditUsagePercent`，这个帧才有周池。

没有 Codex 那种重置卷 API。卡片不显示「重置额度」。

档位：JWT / user `subscription_tier` 数字 → `GROK_TIER_NAMES`（Free / SuperGrok / X Basic / X Premium / X Premium+ / SuperGrok Heavy / Lite / Plus）。`SuperGrokPro` 显示 **SuperGrok Heavy**。

## 缓存

xAI 按 **会话分片** 粘滞，键是 `x-grok-conv-id`，不是前缀哈希。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `grokCacheSessionId` | 清洗 DSH `prompt_cache_key` / `session_id`（1–64，`[A-Za-z0-9._:-]`） |
| 2 | `applyGrokCache` | body 仍带 `prompt_cache_key`（同一 id） |
| 3 | `grokAffinityHeaders` | **只**设 `x-grok-conv-id` |

判定：后面一块 **512 token** 的 cache 且复用 < 10% = **affinity miss**（打到错误分片），不是前缀被改写。分析器标签在 `src/utils/analyze-session.ts`，不要把 GLM 的 576 token 残骸当成这件事。

没有「把 DSH 快照停到 suffix」：Grok 不靠字节稳定前缀。

## 不要

- 不要给 Grok 写 Codex `session-id` / `x-client-request-id`。
- 不要把 Grok 4 加回目录。
- 不要只用 billing JSON 填额度条（Heavy / Premium+ 会空）。

## 追溯

| 问题 | 记录 |
|---|---|
| Grok 缓存命中率低 / 错分片 | [`docs/error.md`](../../../docs/error.md) 2026-08-30 Grok 缓存；2026-08-31 缓存混用 |
| xAI 额度拿不到 | 同文件 xAI 额度 |
| Fast 无加速 | 同文件 2026-08-30 Grok/Codex Fast |

测试：`test/proxy.test.ts`（Grok hop 必须带 `x-grok-conv-id`、禁止 Codex session 头）、`test/cache-families.test.ts`。
