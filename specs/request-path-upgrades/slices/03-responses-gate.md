# 03 Responses 提交闸门按帧分类（F3）

**波次** W2。**依赖**：02b。必须先于 04 合入，因为两者都改 `proxy.ts`。**PR**：1 个。

## 解锁的契约

对 Codex/Grok 的流式响应，在真正的输出事件出现之前，不向客户端提交响应头。这样一来，
「只收到前导帧就断流」这种故障（08-26 事故签名）能在代理内重试，客户端完全看不到。
今天的闸门在真实流上从来不生效：嵌套的 `"type"` 被当成了输出，而且前导帧回显约 128KB
的 `instructions`，超过 64KiB 上限，直接触发提交。

## 接缝

- **第一步：活测捕获。** 从 worktree 的 `lib/` 发 1 次 Codex 流式请求和 1 次 Grok 流式请求，
  prompt 极小。记录从开头到第一个输出事件之间的所有帧。
  - 脱敏：`instructions` 和工具描述换成等长的占位符，保留 JSON 结构、字段顺序和字节大小。
  - 存成 `.sse` 夹具，放在新建的 `test/fixtures/` 目录下（目前不存在）。
- **新增纯模块 `src/oauth/responses-sse.ts`**，负责 Responses 前导帧的分类：
  - `classifySseFrame(frame): 'preamble' | 'output' | 'other'`：只看完整帧，优先读 `event:` 行，
    没有就读 `JSON.parse(data).type`。
  - 前导类型集合：`response.created`、`response.in_progress`、`response.queued`、
    `codex.rate_limits`、`codex.response.metadata`。
  - 一个扫描器负责保存未完成的帧尾。Anthropic 的 `message_start` 等事件要归为 `output`。
- **`CommitGate` 改用它**：
  - 第一个 `output` 帧出现时提交。
  - 前导帧的字节不计入 64KiB 上限，只有无法分类的字节才计入。
  - 缓冲总量超过 2 MiB 时放行提交：宁可失去重试保护，也不杀掉合法响应。同时
    `console.error` 记一行。
  - `COMMIT_DEADLINE_MS` 本 slice 不动，由 04 删除。
- **删除** `EVENT_TYPE`、`hasOutputEvent`、`hasPreambleEvent`。

## 能跑 / 能看见

`node specs/request-path-upgrades/assets/repro/gate-frames.mjs` 改为导入新的分类器：前导帧
得到 output=false，出现 delta 后得到 output=true。

## 验证门禁

`test/proxy.test.ts` 和 `test/anthropic.test.ts`：
- 把 L696 的 `CREATED` 夹具换成捕获的真实前导（没捕获到时先用 repro 里的合成帧）。
  它必须带 `event:` 行、嵌套的 type 和 ≥200KB 的 instructions。
- 前导期间不调用 `writeHead`，直到 delta 到来；到来后前导只发送一次。
- 前导之后流结束：仍然重试（原有规则，现在在真实形态的帧上生效）。
- `response.failed` 归为 output，照常转发，不重试。
- 帧在中间切开、UTF-8 多字节被切开、只有 `data:` 没有 `event:` 的帧，都能正确分类。
- 改写 proxy.test L4、L878–883，anthropic.test L7、L302，改用 `classifySseFrame`。

## 活测

最多 3 次：Codex 1 次、Grok 1 次（捕获用），合入前再发 1 次 Codex 确认流式正常。

## 下放给实施者的决定

扫描器的内部实现，夹具的文件名。

## 必须保持绿色

`npm test`，尤其是 proxy 的韧性测试块（L739–918）。

## 会改变本 slice 的反馈

- 捕获里出现了新的前导事件类型：加进集合，并在 error.md 里记下来。
- 真实前导超过 2 MiB：把证据发给用户（非阻塞），把上限调到实测值的 2 倍。
- 真实流里没有 `event:` 行：分类照常靠 `data` 的顶层 type，其他不变。
