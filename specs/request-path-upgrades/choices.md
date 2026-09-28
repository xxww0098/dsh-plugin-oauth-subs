# 实施中的自主决定（最终账本）

spec 没写到、由实施者拍板的决定，按最终代码（`rpu/integration`）重新核对过。按结论分组，
每组内最没把握的排前面。每条都可以单独读。

## 需要你决定或确认

1. **全部工作在 `rpu/integration` 分支上，`main` 没动。** 你的 WIP（约 60 个文件，含 Command Code、
   donate、Anthropic 导入只读修复）一直没提交且还在改，你选了「自己提交」后又让我继续，所以每个
   slice 都从 48b78b8 分出去，只合进集成分支。合并时 `controller.ts`、`proxy.ts`、`client.ts`、
   `models.ts`、`quota.ts`、`tokens.ts` 大概率冲突。WIP 里的 `#refreshAnthropic` / `#importAnthropic`
   可以直接删：本分支已经把同样的「只读不换票」挂到了通用钩子上（见第 4 条）。
2. **05d（Command Code）没做。** 它的源码只在 WIP 里。WIP 落地后补：删掉 `runRetrying` /
   `commandCodeRetryable`，流内错误的 `statusCode` 当回复状态码；另外 DSH 会话 id 形如
   `session-<uuid>`，Command Code 的 `toWireThreadId` 只收纯 UUID，要在 `command-code/cache.ts`
   里去前缀或用 UUIDv5 做稳定映射，不许用随机数。
3. **合入后 Cline 很可能要重新登录。** 本机 Cline `cli` 登录 09-28 07:29 过期，而 `~/.cline` 里的
   token 09-26 就过期了——插件一直在替 CLI 换票。导入登录改成只读后，Cline 会报
   「imported login is stale」。这是决定 4 的预期代价；Claude Code 的 Keychain token 当前也过期了。
4. **Anthropic 导入只读是从你的 WIP 移植过来的，和 WIP 有三处不同**：报错是 `ImportedLoginStale`
   （403），不是带 `anthropic-import-stale` 码的普通错误；重读只覆盖令牌字段，账号信息保留；没有
   移植 `ANTHROPIC_IMPORT_LOCKED`，Keychain 锁住时本分支读作「没有登录」，结果也是 stale。
5. **Cursor 的 refresh token 其实不轮换**（`cursor-agent` 没有 refresh_token grant，IDE 把同一个 JWT
   同时存成 access 和 refresh）。按决定 4 它仍然只读；它是唯一一个按 spec 可以放开的家族，
   要放开告诉我。
6. **需要真实宿主的检查一个都没做**，因为宿主加载的是 `main`：02a 设置页截图评审、04「未登录 → 403」
   在 DSH 里的显示（误导就改 409）、05「输出后断流」会不会让宿主重试出重复文本、08 的 `/health`
   计数和 `settings.yaml` 里的 `cacheRetention`、14 的 `checkVisibility()` 对保留面板是否有效。
   清单在 README「合入主干后才能做的检查」。

## 暂定，等数据（交给 15 或下一次活测）

7. **Ollama 的 120s 首字节可能误杀长请求。** 基线里 oauth-ollama 有 38/7134（0.53%）次成功调用首字节
   超过 120s（最长 297s），04 之后这些会被切断重试。15 只给 Devin 预设了放宽规则；建议 15 对 Ollama
   用同一条规则（>0.5% 且基线里能成功 → 首字节放宽到整个预算）。
8. **换票卡过 120s 后允许第二次换票。** 如果厂商其实已经处理了第一次并轮换了 token，第二次按时拿到
   `invalid_grant` 会删号。120s 是 spec 定值，这是接受的残余风险。
9. **保活 60s 后，非对话请求碰到陈旧连接不重试。** 刷新、登录换码、额度这些 POST 如果撞上上游已静默
   关闭的连接，会一次性失败后进退避（对话请求会被 04 重试）。按 11 的规则由 15 看 ECONNRESET 计数，
   升高就降到 30s。
10. **`assertPersistedProviders` 严格比对 `cacheRetention`。** 如果宿主读回时丢掉或改写这个字段，每次
    sync 都会报错。08 合入主干后的活测会验证。
11. **Kiro：只在消息文本里说 refresh token 失效、状态又不是 401 的错误，现在算临时失败**（每 10s 重试，
    不删号）。如果出现「一直刷新失败但不删号」，按 06 的反馈规则把真实错误码加进 Kiro 的 `extraCodes`。
12. **GLM 常量会话头 `x-session-id: dsh-glm` 只在 bigmodel 区（经 ZCode 网关）验证过 200**，Z.ai 直连
    没有账号可测。
13. **Codex zstd 的非流式成功路径没验证。** 流式 200；非流式两次都是「模型不支持」的 400（后端已经解压
    并读出了 `model`，所以不是编码被拒），3 次活测额度用完了。
14. **Kimi 和 Anthropic 的导入重读不校验账号。** 其余家族（Codex `accountId`、Cursor token `sub`、
    Cline `userId`）在 CLI 换号时会报 stale，这两家的本地凭据文件里没有账号 id。
15. **Antigravity 在上游不给 `functionCall.id` 时，调用都叫 `call_1…`，`id:` 签名键会跨轮碰撞。** 先查
    `name+args` 键，所以只在它缺失时可能挂错签名。这是存量问题，不在 F7 范围。

## 已定（按证据或按更严的一侧做的）

16. **Antigravity 签名表总量上限从 32 MiB 调到 64 MiB。** 活测签名 140 / 2516 字符，一个满会话约
    10.5 MiB，64 MiB 约容 6 个满会话；当前会话永远最新，不会被整体淘汰。字节预算同时计键和签名。
17. **出站配置加载完之前，`outboundFetch` 先等设置文件读完再路由**（spec 写的是「加载完前走直连」），
    否则早期请求会绕过设置里保存的代理。只有从没调用 `configureOutbound` 时才走直连。
18. **代理路径上任何非中止失败都显示为「出站代理不可用」**，包括经健康代理访问某个上游时的 DNS/TLS
    错误——宁可多报，也不悄悄直连。死端口的最近一次失败也进 `snapshot().error`，错误行放在主栏顶部
    （设置页没有单独的代理区域）。
19. **输出前失败的分类**：hop 抛出的未识别错误算可重试的传输故障；刻意抛出的 `RequestError`（含
    `LoginRequiredError`）不重试；Connect 错误码和厂商错误负载算上游回答，只转发一次；最后一次失败是
    超时回 504，否则 502 +「failed n times」。
20. **「截断」统一按传输故障处理**：Kiro 坏帧/EOF 截断、Antigravity 没有 `finishReason` 就 EOF、Devin
    没有 Connect 结束帧就 EOF、Cursor 残留字节——输出前重试，输出后断流，不再以正常 `stop` 结束。
21. **没有已知额度谓词的家族（Antigravity、Devin、Cursor）不改写 429**，`resource_exhausted` 就是普通
    429；只有 Cline `INFERENCE_CAP_ERROR` 和 Kiro 月度额度改成 `usage limit reached:`（`quotaFailure`
    一个出口，不带 `retry-after`）。所有 Connect 错误都带码记日志，给「到底会出现哪些码」攒证据。
22. **Kiro 401/403 先刷新一次**：刷新后仍被拒就回 400（订阅本身有效，避免宿主提示「API 密钥无效」）。
    Devin 也接了 401 刷新钩子，它的 token 不轮换，等于同一个 token 再试一次。
23. **Cursor 非 200 的 h2 响应头按自己的状态转发**（以前会被误读成 Connect 帧，HTTP 401 永远到不了刷新）。
24. **提交闸门**：夹具存真实前导帧（Codex 2950 B / Grok 2034 B，脱敏含 `id`、`prompt_cache_key`、
    `safety_identifier`），测试加载时把 `instructions` 补到 200 KiB；未完成帧的字节不计入 64 KiB 上限；
    流结束时没有空行收尾的最后一帧不分类（仍会重试）。
25. **令牌生命周期**：20s 等待只是单次请求的上限，超时计失败并把换票标为「迟到」，换票本身最长占位
    120s；同版本的等待者加入进行中的换票；迟到的失败只记录，由下一次按时的尝试决定删不删号；只有 Codex
    有额外的永久错误码（`refresh_token_expired` / `reused` / `invalidated`）。
26. **导入登录**：钩子是 `TokenManager` 的 `imported` 选项，每家族在自己目录里提供；重读只覆盖令牌字段；
    同一版本 10s 内最多重读一次（否则 Cursor Keychain 每个请求 spawn 一次 `security`）；Codex 导入的
    过期时间取 JWT `exp`（旧的 `last_refresh + 1h` 会让 10 天的 token 看起来临期）。
27. **设置页**：状态读取合并成一轮；用户自己的操作之后读 `fresh` 快照，不会拿到操作前的名单；轮询间隔
    仍 1.5s（登录流程要用），额度走 60s 缓存；额度失败也等满 TTL；每次刷新最多等 30s，挂死的 RPC 不会
    永久停掉轮询；GLM/Cursor 身份发现每账号 60s 一次，登录状态变化时重置。
28. **会话 id**：`cacheRetention: 'long'` 在 `buildProviders` 末尾一次性加给所有 Completions 路由；每家族
    一个解析器 + 一个回退谓词（空 id 也算回退，Cline 也有），回退 id 一律不 pin；「显式改推理强度」=
    非空且不同于已 pin 的值；`/health` 计数是模块级的，热重载清零。
29. **Cursor h2 连接池**：键 = origin + 代理串（改出站代理不清池，旧会话 60s 内空闲淘汰）；60s 无帧淘汰；
    清池是优雅关闭，进行中的 run 能跑完；一个 `ctx.effect` 同时覆盖配置变化和插件停止。
30. **保活 60s 的测试真等 6s**：间隔必须超过 undici 固定的 4s 才能证明问题，所以不注入更短的超时。
31. **分析器口径**：事件按自身时间戳落在 `[since, until)`；多版本会话按 `session.version` 去重；
    `poolIdle` = 请求开始 − 同 provider 之前最近一次**成功**响应结束（并发子代理让「上一请求结束」失去
    意义）；失败消息额外把路径脱敏成 `<path>`、长 id 脱敏成 `<t>`。去重让 oauth-ollama 命中率从 64.2%
    变成 67.7%，按 spec 以新口径为准，差异写进了 baseline md。
32. **收尾时把并行留下的重复收成一个所有者**：`upstream.ts` 的 `writeSse` / `pumpBody` / `waitForDrain` /
    `quotaFailure`，`tokens.ts` 的 `forcedRefresh`；删掉 `cursor/refresh-guard.ts`、Devin 的
    `permanent` 标记和 `DevinTransportError`；`docs/error.md` 按「同一根因一条」合并。
