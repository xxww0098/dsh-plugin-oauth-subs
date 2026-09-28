# 01 分析器目录模式 + 冻结基线

**波次** W0（可与 02a 并行）。**依赖**：WIP 已提交。**PR**：1 个。

## 解锁的契约

后面每个 slice 都说自己能改善命中率、超时或重试，这个 slice 提供同一把尺子，改前改后
都能量：

```
npm run analyze -- --dir <path> [--since <ISO|Nd>] [--until <ISO>] [--json] [--compare <base.json>]
```

现有单文件模式保持不变，只是也接受 `.zstd` 文件。

## 接缝

`src/utils/analyze-session.ts` 是会话文件解码和聚合口径的唯一所有者。

- **`readSessionText(path)`**：读普通 JSONL，或 DSH 追加写的多帧 zstd。
  - `zstdDecompressSync(buf)` 只解第一帧（实测 209 B / 1265 帧）。正确做法是循环调用
    `zstdDecompressSync(buf.subarray(offset), { info: true })`，每次按 `engine.bytesWritten`
    前进：21.7 MB 用 22 ms。
  - 末尾被截断的帧（会话正在写）直接丢弃，不报错。
  - 如果 Node 对 zstd 打印 ExperimentalWarning，在 CLI 入口只屏蔽这一条警告。
- **`analyzeSessionDir(root, { since, until }) → AggregateReport`**，另有 `formatAggregate` 和
  `compareReports`。
  - **去重**：同一会话同时存在 `session.jsonl.zstd` 和 `session.v3/v4.jsonl.zstd` 时，按
    `session` 事件的 id 只保留最高版本那份。
  - **归属**：每次调用取 `assistant/message.data.message.source.{provider,model}`，缺失时回退到
    它之前最近的一条 `request/header`。
- **`scripts/analyze-session.ts`**：只负责解析新参数。

按 provider 和 provider/model 两级统计的字段：

| 字段 | 定义 |
|---|---|
| `calls`、`weightedCacheHit`、`uncachedBreakdown` | 沿用 `annotateCacheCalls`，命中率 = cacheRead / (input + cacheRead) |
| `hitByCallIndex` | 按会话内调用序号分桶 0–39 / 40–79 / 80–119 / 120–159 / 160–199 / 200+，按 token 加权 |
| `retries{code:n}` | 来自 `llm/retry` 事件 |
| `idleTimeout300` | 宿主 `stream idle timeout` |
| `proxyExhausted` | 匹配 `/upstream failed \d+ times/` |
| `proxy504` | 匹配 04 引入的 `no output within` |
| `failures[{code,message,n}]` | 前 20 条终态失败。消息规范化：hex→`<h>`，3 位以上数字→`N`，≤120 字符 |
| `ttfbMs{p50,p95,max,over120s}` | 从尝试开始（`step/start`，或最近一条 `llm/retry-started`）到成功消息的第一帧 |
| `silenceMs{p99,max,over110s}` | 成功消息里第一帧**之后**、相邻帧的最大间隔 |
| `poolIdle{over4sShare,p75Ms}` | 请求开始时刻减去同一 provider 上一次响应结束的时刻，**跨会话**计算，因为连接池是进程级的 |
| `coldPenaltyMs` | poolIdle >4s 那组的 ttfb p50，减去 ≤4s 那组的 p50 |

`--compare` 输出差值，计数都按每 1k 次调用归一。

**隐私**：只输出聚合值，不含 cwd、会话 id、提示词正文。

## 能跑 / 能看见

- `npm run analyze -- --dir ~/.dsh/sessions --since 2026-08-29 --until 2026-09-28 --json`
- 冻结结果写到 `specs/request-path-upgrades/assets/baseline-30d.json` 和 `.txt`。

## 验证门禁

- 解码结果与 `zstd -dc` 在本机全部会话文件上逐行一致（抽查不算数，要全量比对）。
- 冻结窗口必须复现 `assets/baseline-2026-09-28.md` 的数字：
  - 命中率误差在约 2 个百分点内。
  - `idleTimeout300` = 35。去重造成的差异要逐条解释，写进 baseline md。
  - Antigravity 的 `hitByCallIndex` 在 120–199 桶明显低于 0–119 桶。
- `test/analyze-session.test.ts` 新增用例：
  - 测试里用 `zstdCompressSync` 拼出多帧文件，外加一个截断的尾帧。
  - 会话中途切换 provider。
  - 多版本文件去重。
  - ttfb 从 `llm/retry-started` 起算。
  - 跨两个会话的 `poolIdle`。
  - 分桶的边界。
  - 失败消息的规范化和脱敏。
- 原有的 12 个用例保持绿色。

## 活测

不需要。

## 下放给实施者的决定

文本报告的排版、内部函数怎么拆分。

## 必须保持绿色

`npm test`，以及单文件模式的输出。

## 会改变本 slice 的反馈

- 如果某个 provider 的 ttfb p99 超过 120s（基线里已知 Devin 有 6 次），在 04 开工前把证据
  发给用户。这是非阻塞检查点：约 5 分钟没有回应，就按决定 7 继续，并把这个风险转交给 15。
- 如果去重规则让基线数字漂移超过 2 个百分点：以新口径为准，在 baseline md 里标注差异来源。
