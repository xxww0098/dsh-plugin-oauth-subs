# 08 Completions 会话 id 接通（F6 主体）

**波次** W2。**依赖**：02b。**PR**：1 个。

## 解锁的契约

9 条回环 Completions 路由都能收到 DSH 的真实会话 id（`prompt_cache_key`）。这 9 条是 kiro、
antigravity、cursor、ollama、kimi、copilot、devin、cline、command-code。从此各家族的 pin、
签名桶、上游亲和字段都按会话区分，不再全进程共用 `dsh-<id>[:<model>]`。今天这种共用会把
第一个会话的系统提示塞进后来的会话。

宿主机制（已在 app.asar 核实）：只有当路由级 `cacheRetention === 'long'` 且
`supportsLongCacheRetention`（回环会自动识别为 true）时，pi-ai 才会发
`prompt_cache_key = sessionId` 和 `prompt_cache_retention: "24h"`；默认值是 `"short"`。

## 接缝

- **`src/oauth/models.ts`**：`buildProviders`（L267-476）只给 `api === HARNESS_COMPLETIONS_API`
  的路由加 provider 级的 `cacheRetention: 'long'`。
  - Responses 路由（Codex、Grok）不加，它们本来就收得到 id。
  - Anthropic 路由（GLM、Claude）不加，见 README「不做」。
  - OpenCode Go 的直连路由（`ensureOpencodeGoRoute`）不动。
- **持久化校验**：`assertPersistedProviders` 要确认同步之后 `settings.yaml` 里这个字段还在。
- **Cursor**：`applyCursorCache`（`cursor/cache.ts:110-119`）必须先推导 id，再删 `prompt_cache_key`。
- **Command Code**：看 DSH 会话 id 的格式。如果不是 UUID，`toWireThreadId` 会把它丢掉，要在
  `command-code/cache.ts` 里改成稳定映射。不许用随机数或时间戳。
- **文档**：Ollama README 的「无文档化 cache-read」说法已过时，deepseek-v4.1-flash 会回
  `cached_tokens`，随本 PR 更正。
- **可观测**：`proxy.ts` 的 `/health` 增加按家族统计的计数：入站请求体里带不带
  `prompt_cache_key`。只计次数，不记 id。在 `rewriteUpstreamBody` 入口、家族剥离字段之前统计。
  这是唯一能在不抓包的情况下确认宿主是否送来 id 的办法，作为永久的健康信号保留。

## 能跑 / 能看见

同步之后，`~/.dsh/profiles/desktop/settings.yaml` 里 9 条 Completions 路由都带上
`cacheRetention: long`。

## 验证门禁

- `test/models.test.ts`：`cacheRetention` 只出现在 Completions 路由上。
- `test/cache-families.test.ts`：
  - Cursor 先推导 id、再删字段；
  - 任何家族的上游请求里都不出现 `prompt_cache_key` 和 `prompt_cache_retention`。

## 活测（合入后，在主检出借热重载做）

这项要验的是宿主的行为，所以不能在 worktree 里做。
- 在 2 个家族上各开两个会话：ollama，外加 kimi 或 cline 中本机已登录的一个。
- `/health` 的计数里，这两个家族「带 `prompt_cache_key`」一项要随请求增长，「不带」一项保持
  不变。
- 每家族最多 3 次请求。

## 合入后门禁（不阻塞，数据交给 15）

合入 ≥3 天后，运行：

```
npm run analyze -- --dir ~/.dsh/sessions --since <合入日> --compare assets/baseline-30d.json
```

任何 Completions 家族的 `weightedCacheHit` 都不应比基线低 3 个百分点以上。

**回退规则**：某家族下降超过 3 个百分点，说明厂商按 key 分片，跨会话共享前缀的收益没了。
这时该家族的**上游**亲和字段改回 `dsh-<id>`，pin 和签名桶仍然按真实 id 区分。写进
error.md 和家族 README。

## 下放给实施者的决定

无。

## 必须保持绿色

`npm test`，`test/models.test.ts` 和 `test/cache-families.test.ts` 的其余用例。

## 会改变本 slice 的反馈

如果活测发现宿主没把 id 送到回环：停下，把证据发给用户。09 的回退隔离照常推进，其余涉及
「真实 id」的收益在 README 里标为未验证。
