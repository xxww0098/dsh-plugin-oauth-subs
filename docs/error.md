# 错误记录

## 2026-08-26：本地 DSH Codex 缓存命中率异常偏低

### 现象

- 环境：本地 DSH 安装的 `dsh-plugin-oauth-subs`，模型为 `gpt-5.6-luna-fast`。
- 证据：`dsh-session-session-d92203fe-406c-489f-b677-8a64f4d16c9f.zip`。
- 90 次模型调用中有 47 次缓存读取为 0。
- 总未缓存输入为 5,689,541 tokens，缓存读取为 2,145,792 tokens，加权缓存命中率约 27.4%。
- 主会话命中率约 28.6%，两个子代理分别约 33.7% 和 17.4%。

### 根因

DSH 的通用 Responses 适配器会发送稳定的 `prompt_cache_key`、`session_id` 和
`x-client-request-id`。插件保留了请求体中的 `prompt_cache_key`，但转发到 Codex
订阅后端时只重新构造 OAuth 与内容类型请求头，丢失了两个会话亲和请求头，导致相同
会话不能稳定路由到同一缓存分片。

上下文压缩不是主因：本次主会话的压缩只集中发生在第 36 步前，而低命中贯穿整个会话。
`prompt_cache_options` 也不是本次主因：默认 short-cache 请求没有发送该字段。

### 修复

`lib/proxy.js` 从格式合法且不超过 64 字符的 Codex `prompt_cache_key` 派生并发送：

```text
session-id: <prompt_cache_key>
x-client-request-id: <prompt_cache_key>
```

不接受请求头直接覆盖该值，Grok 和没有缓存键的请求保持原行为。

### 验证

- 修复前的本地重放：请求体保留缓存键，但两个上游亲和头均为空。
- 修复后的聚焦回归测试：通过，确认两个上游请求头都等于缓存键。
- `node --check lib/proxy.js`：通过。
- `git diff --check`：通过。
- 完整测试当时为 89/90 通过；唯一失败是并行安全加固新增的“token 加载期间客户端断连”测试，与缓存亲和修复无关。

### 运行时验收（2026-08-30 关闭）

- 证据：完整 `session-772f7f3a-332c-4e0c-bff1-6074123474e3`（SkillStar，标题「极简模式快速开关 Agent 技能」），含子代理 `2e1afbbc-…`。
- 模型：`oauth-codex` / `gpt-5.6-terra-fast`，`reasoningEffort: max`，窗口 258000。
- 主会话 211 次调用、71 分钟：未缓存 1,370,864，缓存读取 30,068,480，输出 121,278。
- 加权命中 **95.6%**，前缀复用中位数 **99.6%**，亲和丢失 **0**，TRANSPORT 0。
- 子代理 17 次调用，命中 91.0%，复用中位 99.0%，亲和丢失 0。
- 热身后的一次零缓存（step 55，168,767 未缓存）发生在 `request/header reason=change` 且退出 plan 之后，是前缀重建，不是分片走丢；step 56 立刻 99.2% 命中、168,448 缓存读取。
- 另外 9 次命中下跌与 `compaction/prune` 或 `compaction/start` 对齐（合计约 330k 未缓存）。压缩后下一拍同样回到 ~99% 复用。
- 未缓存构成：增量工具输出 860k，压缩 330k，plan 重建 169k，冷启动 12k，亲和丢失 0。
- 健康规则改为：加权命中 ≥80%，**亲和丢失为 0**，且无 TRANSPORT。压缩 / 适配器重建造成的零缓存不再判失败。
- 诊断：`node --experimental-strip-types scripts/analyze-session.ts path/to/session.jsonl`。

### 前缀稳定（0.0.15，分析之后落地的优化）

亲和头修好之后，插件还能动的是 **input 前缀**，不是再分类一次压缩。

Codex 按 `instructions` 再 `input` 的最长前缀匹配缓存。DSH / llm-pi-ai 会把 system 既放在 `instructions` 又放在 `input[0]` developer。退出 plan 或 `request/header reason=change` 时，多出来的 developer（plan dump、header 重建）如果留在 `input` 开头，会把已经缓存的对话前缀顶掉——step 55 的 168,767 未缓存就是这个形状：`plan/mode active:false` 紧挨着 header 重建。

`lib/codex-request.js` 现在：

1. 剥掉与 `instructions` 重复的 leading developer/system。
2. 把多出来的 leading 文本挪到 `input` **末尾**（对话历史仍从 `input[0]` 开始）。模型还能读到 plan，前缀可以继续命中。
3. `lib/proxy.js` 在 `prompt_cache_key` 缺失或清洗后为空时回退 `session_id`；裁过的键写回请求体；无法使用的键直接删除，避免 Codex 400。
4. 转发前删除 `prompt_cache_retention` / `prompt_cache_options`（gpt-5.6，Codex #39397）。

压缩本身（~330k）和 DSH 改写 system（38,775 → 36,433 字符）仍然会冷写前缀，插件不能冻结 DSH 的 system。能保住的是 **instructions 不变时的对话历史**。

验证：`test/codex-request.test.mjs`（剥重、后缀停放、不提升对话中段的 developer）与 `test/proxy.test.mjs`（session_id 回退、body 回写、retention 剥离、Grok 不继承亲和头）。

### 工具超时不在本插件（2026-08-30）

完整验收会话 `session-772f7f3a-…` 有 12 条 `tool/code-dispatch isError`，**0** 条 TRANSPORT：

| 条数 | 工具 | 原因 | 签名 |
|---|---|---|---|
| 7 | glob | `host_timeout` | `Error: tool call timed out after 30000ms` |
| 3 | glob / read | `cascade_abort` | `glob was aborted…` / `read aborted` / `resolve aborted` |
| 1 | read | `cascade_abort` | 与 glob 同一 `Promise.all` |
| 1 | grep | `invalid` | ripgrep `unclosed group` |

这不是代理掐的。oauth-subs 是 Responses 回环代理，**不跑** glob / read / grep。DSH 宿主把 `glob` / `grep` 交给 `@deepseek-ai/dsh-tool-fs-search`，工具定义上的 `timeoutMs` 默认 **30000**，由 `@deepseek-ai/dsh-tool-call-timeout-policy` 在 `tools/execute` 上落地成上面那句错误。`read` 本身不声明预算；它被掐是因为模型用 `Promise.all` 把 glob 和 read 绑在一起，glob 到点后宿主取消同组调用。

本插件里能看到的超时全不是这条路径：

- `lib/oauth-flow.js`：登录
- `lib/quota.js`：配额拉取
- `COMMIT_DEADLINE_MS`（120s）：SSE 提交门
- `abortOnDisconnect`：只有 llm-pi-ai 断开代理连接时才 abort 上游

TRANSPORT=0 也排除了「代理把 LLM 流掐掉 → 工具被取消」这条耦合。

不要在 oauth-subs 里加 `toolTimeoutMs`，也不要在代理层重试 glob。用户补丁目前到不了挂载模型可见工具的代理平面（[deepseek-harness#4484](https://github.com/deepseek-ai/deepseek-harness/discussions/4484)）。要加长预算，改 `dsh-tool-fs-search` 的 `timeoutMs`，或等 DSH 让补丁能打到 agent-preset。

另外：fs-search 的 glob 在 pattern **不含 `/`** 时按任意深度的 basename 匹配。会话里 `*`、`vitest.config.*` 都会扫整棵 SkillStar 树（含 ignored，不含 VCS），外置卷 `/Volumes/Acasis` 上 30s 很容易打满。

分析器把这三类分开记，不判健康失败。

## 2026-08-26：并发子代理全线 `stream ended before a terminal response event`

### 现象

- 环境：本地 DSH 安装的 `dsh-plugin-oauth-subs` 0.0.12，模型 `gpt-5.6-luna-fast`。
- 证据：`dsh-session-session-d92203fe-406c-489f-b677-8a64f4d16c9f.zip`（与上一条同一份会话）。
- 19:41 DSH 重启装入 0.0.12（`settings.yaml` 重写，contextWindow 272000→258000）。
- 19:44:15 七个会话同时恢复；19:44:39 起走 `oauth-codex` 的 6 个会话（主会话 + 5 个子代理）
  全部报 `OpenAI Responses stream ended before a terminal response event`，共 29 次 TRANSPORT。
- 每个会话重试 5 次后放弃，退避 500ms → ~8000ms±10%（用户看到的 8443ms 是最后一次）。
- 唯一存活的 `b082f542` 走的是 `opencode-go` / deepseek-v4-flash，不经过本插件。
- 同一份会话早前 15:31/15:35/15:37 出现过 3 次 `500 "fetch failed"`。

### 根因

上游是一次瞬时的 socket 级故障，而**插件把它伪装成了正常结束**。

`OpenAI Responses stream ended before a terminal response event` 不是上游返回的错误，
是 llm-pi-ai 读完 SSE 没等到 `response.completed` 时自己生成的，并且命中它的 TRANSPORT
重试名单（`@earendil-works/pi-ai/dist/utils/retry.js`），所以会不带任何上游信息盲重试 5 次。

`lib/proxy.js` 的 `forward()` 原本以 `finally { if (!response.writableEnded) response.end() }`
收尾：一旦上游流在**响应头发出之后**中断，读流抛出的错误被 `finally` 抢先干净收尾，客户端
收到的是一个「HTTP 200 + 干净 EOF」，上游真实原因整个丢失。

15:31–15:37 那 3 次 `500 "fetch failed"` 是同一类故障发生在**响应头之前**，走
`handle().catch()` 才漏了出来——这是本次定位的关键对照。

### 排除项（均实测真实接口，不能复现）

0.0.12 在请求路径上只改了一行（新增 `accept: text/event-stream`），逐项验证后全部排除：

- `accept: application/json` vs `text/event-stream`：ttfb / 字节数 / 事件数完全一致。
- 6 路并发短流：全部 `response.completed`。
- 6 路并发 × 75k 冷 prefill（450k 未命中 token）：ttfb 仅 3–5s。
- `service_tier: priority`（`-fast` 走的路径）+ 长输出：干净完成。
- 配额：周窗口 `used_percent: 2`，无 5 小时窗口，`limit_reached: false`。

结论：上游瞬时故障，重启导致 7 个会话同时恢复只是诱因。插件的责任是让它无法诊断。


#### 第一层：不再把断流伪装成正常结束

- `forward()` 增加 `catch`：响应头已发出且非客户端主动断连时，`console.error` 打印真实
  原因并 `response.destroy(error)`；日志附带断流前的静默时长与已收字节数。
- 新增 `describeError()`，把 undici 光秃秃的 `fetch failed` 拼上 `error.cause.code`。

#### 第二层：提交门 + 上游重试（针对本次失败签名）

失败签名是「`response.created` 之后零内容事件」，说明**客户端还没拿到任何有用字节**，
因此这段窗口内重试是安全的。`CommitGate` 在流证明自己在产出之前，不向客户端提交响应头：

- 缓冲期间只要出现**非前导事件**（`response.created` / `in_progress` / `queued` 之外的
  任何类型，含 `response.failed`），立即提交并原样吐出缓冲——真实错误不会被重试掉。
- 缓冲超过 64KB 或超过 120s 强制提交，避免无界缓冲和触发客户端的 header 超时。
- 未提交状态下断流或 `fetch` 抛错 → 换一次上游请求重试，共 3 次，退避 1s / 4s。
  这同时覆盖了 15:31 那批 `500 "fetch failed"`（响应头之前断）。
- 3 次耗尽 → 返回带真实原因的 502 JSON，而不是静默 EOF。
- 重试条件收紧到只匹配事故签名（`bytes === 0 || sawPreamble`）：`stream: true` 却收到
  非 SSE body 时原样转发，不当作故障。

效果是把 DSH 侧的重试地平线从 5 次放大到 5×3 次，且 DSH 完全感知不到被吸收的那几次。

### 对抗性审查

针对新逻辑逐条构造攻击并落成测试，其中两条打中了实现：

- **非流式响应被吞**：`push()` 在非门控路径上 flush 了空缓冲并返回 `false`，导致调用方
  跳过写入，body 变空。已修（非门控直接 commit 并返回 `true`）。
- **`hasOutputEvent` 永远返回 false**：web stream 的 chunk 是 `Uint8Array` 不是 `Buffer`，
  `chunk.toString('latin1')` 忽略参数、返回逗号分隔的数字串，正则永不命中。已修
  （`Buffer.from(chunk).toString('latin1')`）。
- **规则过度扩张**：预存测试「proxy asks upstream for SSE when the body streams」抓到
  `stream: true` + 非 SSE body 被误判为空流重试。已收紧。

其余攻击面（真实 `response.failed` 被重试掉、已提交后仍重试、客户端断连时空转重试、
缓冲无界增长、前导事件重复送达客户端）均已覆盖且通过。

### 外部依据

- `nodejs/undici#5450` —— 并发下 `TypeError: fetch failed` 的成因是连接池复用了远端已
  关闭的 socket；维护者明确回应「Client 的整个队列会随 socket 拆除而 error」，推荐
  `interceptor.retry` / `RetryAgent`。本插件不引入 undici 依赖，用自己的重试循环等价覆盖。
- undici `RetryHandler` 文档：**不重试有状态 body**（stream / AsyncIterable），且续传依赖
  `Range` / 206。SSE 响应两条都不满足，所以 `RetryAgent` 无法处理中途断流——必须自己在
  代理层做提交门。本插件请求体是 `Buffer`，可安全重放。

### 验证

- 单元：`test/proxy.test.mjs` 18 个用例，含上述全部对抗场景；`npm test` **97/97 通过**。
- 端到端：用新代码起本地代理打真实 `chatgpt.com/backend-api/codex/responses`，
  6 路并发 `gpt-5.6-luna-fast`，6/6 `response.completed`，
  `event: response.created` 帧数恒为 1（提交门字节透明，未重复送达前导事件）。
- 复现尝试（均无法触发，说明触发条件在上游侧）：16 路并发 priority 长流、
  6 路 × 75k 冷 prefill、accept 头 A/B、配额检查。

### 已知边界

- **不保证上游不再抖动**。本次修复保证的是抖动不再演变成「子代理全灭、work 丢失」。
- 重试会让上游重复计费一次；相对 DSH 原本的 5 次盲重试是净改善。
- 若断流发生在**已产出内容之后**（本次事故不属于此类，deepseek 那条属于），无法重放，
  只能如实报错——这是协议决定的，不是实现取舍。

### 同类项目怎么做的

对照 `router-for-me/CLIProxyAPI`（48.8k★，同为 Codex OAuth 转 API）与
`QuantumNous/new-api`（46.4k★，LLM 网关）的实现：

**CLIProxyAPI 独立收敛到了同一个设计。** `internal/runtime/executor/codex_executor_stream.go`
有一段 "bootstrap" 逻辑，注释写得很直白：

> `isCodexHandshakeMetadataEvent` reports whether an event carries no generated output and is
> therefore safe to hold back **before the downstream response headers are committed**.

它的 handshake 白名单是 `response.created` / `response.in_progress` / `codex.rate_limits` /
`codex.response.metadata`，上限按**事件数**（`codexBootstrapMaxBufferedEvents = 16`）。
本次已把两个 `codex.*` 帧并入我们的 `PREAMBLE_EVENT_TYPES`。

它做这件事的原因值得记下：**chatgpt.com 会返回 HTTP 200，然后把拒绝塞在 SSE 流里面**
（`newCodexBootstrapOverloadErr` 专门处理流内的 `server_is_overloaded` / `rate_limit_exceeded`，
转成 503 好让别的凭据接手）。本次事故是这个模式的退化形态：流内连错误事件都没有。

它还有 `codexIncompleteStreamError`，消息是
`"stream disconnected before completion: stream closed before response.completed"`，
状态码 408，并实现 `IsRequestScoped() = true` —— 即这类错误**不惩罚/冷却凭据**，
按单次请求故障处理。

**new-api 的两个机制，我们不需要或已有等价物：**

- `STREAMING_TIMEOUT`（默认 300s）——上游流空闲超时。Node 的 undici `bodyTimeout` 默认同为
  300s，等价保护已经免费拿到，不需要自己实现。
- 下游 SSE 心跳 `: PING\n\n`（默认 10s）——在长静默期保活客户端连接。与提交门互斥：
  头没提交就发不了心跳。我们选了可重试性，代价是那段窗口不发心跳；因为 undici 的
  `headersTimeout` 是 300s，而提交门 120s 强制提交，边界安全。
- new-api 的 `StreamStatus.IsNormalEnd()` 把 `StreamEndReasonEOF` 算作**正常结束**——
  和我们修复前踩的是同一个坑，区别是它至少把 `EndReason` 记了下来。

**考虑过但没做**：照搬 CLIProxyAPI 的「流内 overload 拒绝 → 重试」。它的价值主要在多凭据
failover，而本插件是单账号；且对 `rate_limit_exceeded` 做 1s/4s 退避重试只会拖延错误上报。
本次事故也没有这个签名。等出现证据再做。

### 目录漂移（0.0.14 已修）

实测真实接口发现的目录漂移，本次事故排查时记录、在 0.0.14 一并对齐：

- `CODEX_REASONING` 曾向所有模型暴露 `minimal`，而所有 Codex 模型均以 400 拒绝
  （`Unsupported value: 'minimal' is not supported`）。已移除。
- `CODEX_MODELS` 曾列 `gpt-5.3-codex`，该模型对 ChatGPT 账号已下线
  （`not supported when using Codex with a ChatGPT account`）。已移除；`gpt-5.3-codex-spark` 保留。
- `-ultra` 别名：目录把 `ultra` 列进 `supported_reasoning_levels`，但 Responses API 对
  Sol / Terra / Luna 一律 400（`Invalid value: 'ultra'`）——那是 Codex CLI 客户端侧的多智能体
  委派（`multi_agent_version`），不是 wire 上的 effort。别名只能退化成 `max`，与直接选 `max`
  完全等价，已整体删除。
- `-fast` 曾按 `gpt-` 前缀发放，而 `gpt-5.4-mini` 与 `gpt-5.3-codex-spark` 的 `service_tiers`
  为空。改为逐模型读目录。
- 大窗口曾写死 900K，实际是 Sol / Terra / Luna 872K、gpt-5.4 1M。改为逐模型。
- `/codex/v1/models` 缺 `client_version` 查询参数，必返 400。已补。

根因是同一批模型事实在四个文件里各抄了一份（第五份是 `models.js` 里重写的
`withPickerVariants`，而三个 `with*Variants` 是死代码）。0.0.14 把事实收进 `lib/codex.js`
一张表，其余模块查 `codexModel()`。
