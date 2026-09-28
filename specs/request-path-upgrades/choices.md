# 实施中的自主决定（choices 账本）

spec 没写到、由实施者自己拍板的决定。每条：决定 → 理由 → 结论（sound / provisional / user）。
最终收尾时按最终代码重写本文件。

## 编排

- **在 `rpu/integration` 集成分支上实施，不碰 `main`。** 维护者的 WIP（约 60 个文件，含 Command
  Code、donate、Anthropic 导入只读修复）仍未提交且在持续改动；用户选择「自己提交」后又指示
  继续。所以各 slice 从 HEAD（48b78b8）+ spec 提交分支，合进 `rpu/integration`，由维护者在
  WIP 落地后 rebase/合并。→ provisional（user）：WIP 与 `controller.ts`、`proxy.ts`、
  `client.ts`、`models.ts`、`quota.ts` 必有冲突，需维护者合并时处理。
- **依赖 WIP 的部分暂缓**：05d（Command Code 源码只在 WIP 里）、08 的 Command Code 部分、07 的
  Anthropic 迁移（`#refreshAnthropic` 只在 WIP 里）。→ provisional，WIP 落地后补。

## 02a

- **错误行放在主栏 `.osubs-pane` 顶部**（与现有 RPC 错误提示同款 `.osubs-hint.osubs-bad`），
  因为 `client.ts` 没有「出站代理区域」，只有 `proxyGet`/`proxySet` RPC。→ sound。
- **死端口也进 `snapshot().error`**：代理 URL 能构建、但连不上时，记录最近一次代理路径失败，
  下次成功或 `setUrl` 清掉；否则 spec 要求的 `HTTPS_PROXY=http://127.0.0.1:9` 在设置页看不到。
  → sound。
- **代理路径上除中止外的失败都包成 `outbound proxy unavailable: <detail> via <脱敏代理>`**；
  中止原样抛出，保留代理的中止处理。→ sound。
- **`close()` 后如仍配置了代理，`error = 'closed'`**：迟到的请求失败而不是直连。→ sound。
- **`setUrl` 的构建错误原样抛给调用方**，不包装。→ sound。

## 01

- **时间窗按事件自身时间戳 `[since, until)` 计**；mtime 早于 `since` 的文件直接跳过。→ sound。
- **多版本去重**：版本取 `session` 事件的 `version`，缺失时取文件名 `.vN.`；无 id 的会话按路径作键。→ sound。
- **解析失败的文件计为 unreadable 并跳过**（当前数据 0 个），不中断整次运行。→ sound。
- **`idleTimeout300` / `proxyExhausted` / `proxy504` 同时计入被重试的和终态的失败**：每次都真实付出了等待。→ sound。
- **`poolIdle` = 请求开始 − 同 provider 在它之前最近一次成功响应结束**（不是「上一请求结束」）：并发子代理让后者对 codex 失去意义。→ sound。
- **失败消息额外脱敏**：家目录/tmp 路径 → `<path>`，长字母数字 id → `<t>`（真实消息里有 `/Users/...` 和 `req_…`）。→ sound。
- **不屏蔽 zstd 的 ExperimentalWarning**：Node 24.21 / 26.8 都不打印。→ sound。
- **ttfb 检查点未触发**（最大 p99 = oauth-ollama 72.5s），但 oauth-ollama 有 38/7134（0.53%）次成功调用首字节 >120s（最长 297s），04 会把它们切断重试。spec 15 只给 Devin 预设了放宽规则。→ provisional：交给 15，按 Devin 同款规则（>0.5% 且基线成功）评估 Ollama。

## 02b

- **配置后 `outboundFetch` 先等 prefs 加载（`ready` 必然 settle）再路由**；只有从未调用
  `configureOutbound` 时才直接走直连 Agent。spec 写「加载完成前走直连」，但那会让早期请求
  绕过设置文件里保存的代理。→ sound（比 spec 更严，守住「绝不悄悄直连」）。
- **NO_PROXY / 回环只约束 Cursor 的「出站代理回落」**；显式 `cursorProxy` / `PI_CURSOR_PROXY` /
  `CURSOR_PROXY` 原样使用（保持现状，现有隧道测试经显式代理拨 127.0.0.1）。→ sound。
- **保留 `createOutboundSession` 作为 `configureOutbound` 背后的工厂**，冻结的 repro 仍能跑。→ sound。
- **`close()` 后会话仍是 current，直到新实例 `configureOutbound` 替换**：迟到请求失败而不是直连，
  热重载顺序无关。→ sound。
- **每个会话自带直连 Agent，`close()` 两个一起释放**。→ sound。
- **`outboundProxyFor` 是 async（等 prefs）**；`cursorH2Connect` 本来就是 async。→ sound。
- **Cursor 目录缓存键改用实际出口（`cursorEgressProxy`）**：换出站代理后按区域重拉目录。→ sound。
- **10s 连接超时也覆盖经代理隧道的会话**（隧道内 TLS 同样会挂）。→ sound。
- **防火墙额外拦 `?? fetch`、`|| fetch`、`globalThis.fetch`、`require`/`import('undici')`**。→ sound。
- **Cursor 区域错误提示仍只看 `cursorUpstreamProxy()`**，建议配 `cursorProxy` 依然成立，未改。→ sound。
