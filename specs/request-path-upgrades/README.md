# 请求链路升级：稳定性 / 速度 / 缓存命中率

把 2026-09-28 审计出的 11 个问题（F1–F11）拆成可单独验收的 slice。每个 slice（含子 slice）
一个 PR，按 implement-spec 的流程推进。

## Next Agent Prompt

**状态（2026-09-28）**：实施中，在集成分支 `rpu/integration`（worktree
`/Users/xxww/Code/REPO/rpu/integration`）上推进。已合入：02a。进行中：01、02b。

**先决条件的处理**：维护者的 WIP（约 60 个文件）仍未提交，用户指示继续。各 slice 从
48b78b8 + spec 提交分支，只合进 `rpu/integration`，**不碰 `main`**；WIP 落地后由维护者
合并（预期在 `controller.ts`/`proxy.ts`/`client.ts`/`models.ts`/`quota.ts` 冲突）。依赖 WIP
的部分暂缓：05d（Command Code）、08 的 Command Code 部分、07 的 Anthropic 迁移。

**你接下来要做的**：
1. 读本 README、[`choices.md`](choices.md)、下一个 slice 文件和仓库根的 `AGENTS.md`。
2. 下一个 pickup：02b 合入后开 W2（03、06、08、14、11 并行，各一个 worktree
   `/Users/xxww/Code/REPO/rpu/<slice>`，从 `rpu/integration` 分支，`npm ci`）。
3. 每轮结束前更新本节与 `choices.md`。

**工作方式（别踩的坑）**：
- desktop/web 两个 profile 都是 link 安装，指向本仓库根目录。在主检出里跑
  `npm run build` / `dev-build`，宿主会立刻热重载半成品 `lib/`。所以实现、构建、测试一律在
  worktree 里做，绿了再合入主干。
- 活测只从 worktree 的 `lib/` 直接 import 家族模块，规则见下文「验证总则」。
- `docs/error.md` 每个 PR 都会追加条目，rebase 时的小冲突是预期内的。

**全局 TODO**：
- [ ] 01 分析器目录模式 + 冻结基线 → [slices/01](slices/01-analyzer-dir.md)
- [x] 02a 出站代理不再卡死启动（P0）→ [slices/02](slices/02-outbound-owner.md)
- [ ] 02b 出站 HTTP 单一所有者 → [slices/02](slices/02-outbound-owner.md)
- [ ] 03 Responses 提交闸门按帧分类 → [slices/03](slices/03-responses-gate.md)
- [ ] 04 上游尝试原语 + `forward()` → [slices/04](slices/04-upstream-attempt.md)
- [ ] 05a–e 自定义传输层迁到原语 → [slices/05](slices/05-custom-transports.md)
- [ ] 06 令牌生命周期核心 → [slices/06](slices/06-token-core.md)
- [ ] 07 导入登录只读 → [slices/07](slices/07-imported-logins.md)
- [ ] 08 Completions 会话 id 接通 → [slices/08](slices/08-conversation-id.md)
- [ ] 09 回退 id 不再跨会话 pin + GLM 常量 → [slices/09](slices/09-fallback-isolation.md)
- [ ] 10 Antigravity 签名表 LRU → [slices/10](slices/10-antigravity-signatures.md)
- [ ] 11 keep-alive 60s → [slices/11](slices/11-keepalive.md)
- [ ] 12 Cursor HTTP/2 连接池 → [slices/12](slices/12-cursor-h2-pool.md)
- [ ] 13 Codex 请求体 zstd → [slices/13](slices/13-codex-zstd.md)
- [ ] 14 设置页轮询与额度 TTL → [slices/14](slices/14-settings-polling.md)
- [ ] 15 收尾复测（合入后 ≥7 天）→ [slices/15](slices/15-closeout.md)

## 目标与非目标

**目标**：先修掉让插件整体不可用的 P0；让上游卡住时代理自己在宿主 300s 看门狗之前收场；
让刷新失败不再删号；让每个会话拿到自己的缓存身份；减少新建连接和上传开销；把设置页
的后台请求降下来。每项都要有「改前 / 改后」的证据。

**非目标**（原因见「不做」）：Ollama 上 GLM 的缓存、OpenCode Go 直连路由、Claude 1h
缓存 TTL、多账号 429 故障转移、代理内重试 429/5xx、改宿主配置、Codex WebSocket
传输、数据迁移。

## 问题清单（F1–F11，2026-09-28 审计）

| # | 问题 | 证据 | slice |
|---|---|---|---|
| F1 | 配置出站代理（设置页、`proxyUrl`、`HTTPS_PROXY` 任一）后，`require('undici')` 失败，`outbound.ready` 永不 resolve，回环代理不监听。`setUrl` 先写文件再构建，导致之后每次重启都卡死。Cursor 的 h2 还会绕过出站代理 | `repro/outbound-deadlock.mjs` | 02 |
| F2 | 等响应头没有超时（undici 默认 300s，正好等于宿主看门狗）；有头无体时 3×120s+5s≈365s，超过宿主的 300s；自定义传输层没有任何计时器；头发出后的异常被收成干净的 EOF | `repro/stall-budget.mjs`；30 天 35 次宿主 300s 超时 | 04、05 |
| F3 | 提交闸门把 `response.created` 里嵌套的 `"type"` 当成输出，而且回显的约 128KB `instructions` 超过 64KiB，所以闸门在真实流上从不生效 | `repro/gate-frames.mjs` | 03 |
| F4 | 超时后才成功的换票被丢弃，结果被登出；过期令牌刷新失败后没有退避；403 被当成永久失败而删号；导入登录和 CLI 共用会轮换的 refresh token；只有 401 会触发刷新 | 代码核实 | 06、07、05 |
| F5 | 自定义传输层的流内错误被宿主按文本归为 `PI_AI_ERROR`，不会重试；Antigravity 把 `body.error` 当成正常结束；额度耗尽的 429 被宿主白白重试（Cline 5 次） | 宿主分类器；基线里的重试原因 | 04、05 |
| F6 | 9 条 Completions 路由从没收到过会话 id（没设 `cacheRetention`），系统提示 pin、thinking 配置、签名桶都被全进程共享，导致跨会话串用系统提示 | pi-ai 源码；代码核实 | 08、09 |
| F7 | Antigravity 签名表每个会话 256 键、先进先出淘汰，约第 128 次调用开始前缀滚动断裂 | 按调用序号统计的命中率：88–94% 掉到 41–50% | 10 |
| F8 | GLM Anthropic 线路的 `x-session-id` 每个进程随机生成 | `glm/index.ts:323` | 09 |
| F9 | Node fetch 空闲约 4s 就断开连接（chatgpt.com 新建连接约 1.7s）；Cursor 每次 run 都新建 h2 连接 | `repro/keepalive-idle.mjs` | 02、11、12 |
| F10 | Codex 请求体没有压缩（宿主自带的 Codex provider 用 zstd） | 宿主源码 | 13 |
| F11 | 设置页每 1.5s 轮询一次，额度 TTL 只有 10s，13 个账号约每分钟 78 次请求 | 代码核实 | 14 |

## 访谈决定（2026-09-28，用户确认）

1. 范围：F1–F11 全做。
2. 授权实施 agent 把 `undici@^7` 加进 `dependencies`，并更新 `package-lock.json`。
   宿主运行时是 Node v24.21.0，自带 undici 7.29.1。版本号、tag、release 一律不动。
3. 活测：允许最小活测，每个 slice 每家族 ≤3 次极小请求，结论写进 `docs/error.md`。
   不改账号设置，不删登录。
4. 从厂商 CLI 导入的登录只读：不自己换票，临期重读源文件；源也过期就明确报错。
   沿用 09-28 Claude 修复的做法。
5. 重试契约不动：上游 4xx/5xx 原样转发，代理内不重试。只做两件事：把已知的
   「额度耗尽」改写成宿主能识别的措辞；删掉 Command Code 的代理内状态码重试。
6. 基线：扩展现有 `npm run analyze`（目录模式），不另写报告工具。
7. 超时：每次尝试首字节（含响应头）120s；输出前总预算 270s，下一次尝试塞不进预算就
   回 504；输出开始后空闲上限 270s。宿主路由的 `streamIdleTimeoutMs` 保持默认 300s。
8. 设置页：只在插件面板真正可见时轮询；被动额度 TTL 60s；手动「刷新额度」强制刷新；
   并发的 `snapshot()` 合并成一次。
9. 不做向后兼容，不做数据迁移，硬切。本机存量 Codex 登录没有 `source` 字段，如果它
   来自 Codex CLI，切换后手动重新导入一次。

## 合成时我做的决定（草稿分歧处）

四份草稿：A 最少 slice、B 风险优先（Codex gpt-6-astra）、C 接口缝质量、D 验证优先。
下面列的是分歧处的取舍；其余结论各草稿独立一致。

- **401 刷新一次、GLM 网关回退、Devin `user_jwt` 重试保留。** B 把决定 5 读成要删掉这
  三处，我不采纳：它们是 error.md 里明文保留的例外，不属于「重放 4xx/5xx」。
- **删掉 Devin 与 Command Code 的代理内 HTTP 5xx 重放**（Command Code 连 429 一起）。
  这是在执行决定 5 的契约，不是改契约：宿主本来就会重试 5xx（SERVER），重试只保留一个
  所有者。如果用户否决，05c/05d 保留原重放，其余照做。
- **计时模块放 `src/oauth/upstream.ts`**，不放 `src/utils/`：它属于代理域，而且家族传输层
  已经在 import `src/oauth`。
- **「首字节」包括前导帧。** 前导帧到了之后的静默受 270s 空闲和 270s 预算约束。「只有前导
  就断流」仍然走快速重试（08-26 事故签名）。这样长推理不会在 120s 被误杀。
- **非流式请求的首字节窗口等于剩余预算**：整段响应一次性到达，120s 会误杀长生成。
- **出站 HTTP 收成模块级 `outboundFetch`**，把 31 个文件里的 94 处 `fetchFn = fetch` 默认值
  全部换掉，并加源码扫描防火墙（C）。只修两个漏接的调用点，留不住这个不变量。
- **Antigravity 签名表总量上限 32 MiB**（B、D），10 里用活测量到的真实签名大小再校准。
- **过期令牌负缓存 10s**（A、D）。另外加一个「迟到交换未决标记」，上限 120s（D），堵住
  A、C 各自指出的残余竞态。
- **设置页可见性判断**：先用 `checkVisibility()`，DevTools 里确认它对保留面板无效时，改用
  IntersectionObserver（A）。
- **导入只读的家族**：Codex、Cursor `cli_keychain` 与 `ide_vscdb`、Cline `cli`、Kimi `cli`，
  Anthropic 已在做。排除 Devin（`refreshDevin` 从不换票）和 Copilot `cli`（GitHub token
  不轮换）。
- **粒度**：15 个 slice，05 下分 a–e 五个子 slice。最少 slice 的草稿只有 7 个，但它合并出来
  的 slice 一次要验多个变量，违背「一个 slice 一个判定」。

## 证据

- [`assets/baseline-2026-09-28.md`](assets/baseline-2026-09-28.md)：命中率、300s 超时、重试
  原因、建连开销、宿主（DSH）行为事实。宿主的失败分类正则也逐字抄录在这里，04 的契约
  测试以它为准。
- [`assets/repro/`](assets/repro/)：四个可运行复现，在仓库根目录 `npm run build` 后执行。
  `outbound-deadlock.mjs`（F1）、`stall-budget.mjs`（F2）、`gate-frames.mjs`（F3，附已验证的
  按帧分类原型）、`keepalive-idle.mjs`（F9）。修复后各自的输出应翻转，每个脚本头部注释
  写了期望值。
- [`assets/analysis/`](assets/analysis/)：产出基线的原型脚本，依赖 Homebrew `zstd`。01 的目录
  模式要复现这些数字，之后这些脚本只作存档。

## Slice 图

| 波次 | slice（同波并行） | 依赖 |
|---|---|---|
| W0 | 01、02a | WIP 已提交 |
| W1 | 02b（单独落地：改 31 个文件的默认值） | 02a |
| W2 | 03、06、08、14 | 02b |
| W3 | 04、09、11 | 04←03，09←08，11←02b |
| W4 | 05a–e、07、10、13 | 05←04（05e 还要 02b），07←06+04+14，10←09，13←04 |
| W5 | 12 | 05e、02b |
| W6 | 15 | 全部合入后 ≥7 天 |

同文件串行：`proxy.ts` 03→04→05/13，`controller.ts` 14→07，Antigravity 目录 09→10。

## 单一所有者（refactor-clean 结论）

| 概念 | 唯一所有者 | 删掉的并行实现 |
|---|---|---|
| 出站 HTTP（undici、dispatcher、代理解析、默认 UA） | `src/utils/outbound.ts` | 94 处 `fetchFn = fetch` 默认值、`createOutboundFetch`、`require('undici')` |
| 上游尝试（计时、预算、重试、失败→HTTP 映射） | `src/oauth/upstream.ts` | `withIdleTimeout`、`UpstreamIdleError`、`UPSTREAM_IDLE_TIMEOUT_MS`、`COMMIT_DEADLINE_MS`、Devin/Command Code 的 `runRetrying` |
| Responses 前导帧分类 | `src/oauth/responses-sse.ts` | `EVENT_TYPE`、`hasOutputEvent`、`hasPreambleEvent` |
| 刷新语义（换票、永久失败、迟到结果、导入重读、「需要登录」错误 `LoginRequiredError`） | `src/oauth/tokens.ts`（`TokenManager`） | 各家「永久失败」的正则、controller 里的 `#refreshAnthropic`、`codex/index.ts` 里的 `OAuthEndpointError`、裸 `Error('… is not logged in')` |
| 会话 id | 各家族自己的 `cache.ts`（一个 resolver + 一个 fallback 谓词） | 四个传输层里的二次推导 |
| 宿主是否送来会话 id 的健康信号 | `proxy.ts` 的 `/health` 计数（08） | — |
| 会话文件解码（多帧 zstd） | `src/utils/analyze-session.ts` | `assets/analysis/*.mjs`（降为存档） |

终态要读起来像今天从零设计的：没有兼容层，也没有留着「以后再删」的脚手架。只有两处过渡
接缝，都写明了由谁删：
- 02a 保留 `createOutboundSession().fetchFn`，02b 引入 `outboundFetch` 后删掉它。
- 03 暂时不动现有的 `COMMIT_DEADLINE_MS`，04 用预算取代并删掉它。这是现有代码，不是新加的
  脚手架。

## 防火墙（不许做）

- 不调 `setGlobalDispatcher`，`outbound.ts` 之外不出现 undici，也不建第二个 Agent。例外：
  Cursor 的 h2 拨号器只能调 `outboundProxyFor()`。
- 代理内不重放已转发的 HTTP 状态或厂商错误负载。仅有的例外：401 刷新一次、GLM 网关
  回退一次。
- 不用 `Date.now()` 或随机数当会话/缓存 id，Codex/Grok 的缓存头不外发给别家。
- `cacheRetention` 只加在 Completions 路由上；不改宿主的 `streamIdleTimeoutMs`。
- 不对导入的 refresh token 换票；活测进程绝不调用 refresh 或 TokenManager。另一个进程
  轮换 token 会把宿主登出。
- 不手改 `lib/`；不改版本号，不打 tag；lockfile 只在 02a 里改。
- 基线和夹具只放聚合数据：不含 cwd、会话 id、提示词正文、凭据。捕获的帧要脱敏，
  保留结构和字节大小。仓库根的 `assets/` 会进 npm 包，spec 证据只放本目录。

## 验证总则

- **每个 PR**：先跑聚焦测试，再跑 `npm test` 全绿（含 `package-surface`）；
  `npm run build` 后提交 `lib/`；`docs/error.md` 追加一条（≤12 行，现象/根因/修复）；
  家族行为变了就更新家族 README。
- **活测**：每个 slice 每家族 ≤3 次极小请求。从 worktree 的 `lib/` 直接 import 家族模块，
  凭据取自 `~/.dsh/profiles/desktop/data/dsh-plugin-oauth-subs/`。access token 按原样使用，
  5 分钟内就要过期的跳过。绝不刷新。要验宿主行为的（例如 08）在合入主干后借热重载做。
- **人工检查点都不阻塞**：把证据发给用户，等约 5 分钟；没有回应就按证据决定，把决定和
  理由写进对应 slice，然后继续。
- **UI 可见改动**（02a 的代理错误行）：截设置页工作台的图，对照
  `design-system/MASTER.md` 和 `design-system/pages/settings-workbench.md`，最后做一次不带
  预设的截图评审。本机没有 screenshot-critique skill，就让一个全新子代理只看图来评。
- **choices 账本**：实施中凡是 spec 没写到、由实施者自己做的决定，都按 implement-spec
  记进 `choices.md`。

## 已知未知 → 由谁发现

| 未知 | 发现于 |
|---|---|
| 真实 Codex/Grok `response.created` 的形态和大小 | 03 活测捕获 |
| 宿主 TTFB 分布，以及 120s 首字节会不会误杀 Devin（基线：6 次 120–181s） | 01 → 15 |
| 宿主怎么显示 403（「未登录」映射） | 04 人工检查点 |
| Connect 错误帧里到底带哪些 code | 05e / 05c |
| 各导入家族的 refresh 是否轮换 | 07（厂商客户端源码 + 被动观察） |
| DSH 会话 id 的格式（Command Code `toWireThreadId` 只收 UUID） | 08 |
| 宿主在 `cacheRetention: long` 下是否真的给回环发 `prompt_cache_key` | 08 合入后活测 |
| 按会话分 id 会不会拉低首轮命中（厂商按 key 分片） | 08 → 15 |
| Antigravity 签名的真实大小 | 10 活测 |
| 服务端是否在 60s 内关闭空闲连接（陈旧 socket 导致 ECONNRESET） | 11 → 15 |
| Codex 后端是否接受这个客户端的 zstd 请求体 | 13 活测 |
| 保留的主面板能否用 `checkVisibility()` 判断可见 | 14 |

## 不做（及原因）

- **代理内按 `retry-after` 等待重试**：用户否决（决定 5），契约不动。
- **导入登录换票后写回 CLI 文件**：用户否决（决定 4），对 CLI 文件有侵入，钥匙串来源也
  写不了。
- **把宿主路由的 `streamIdleTimeoutMs` 拉到 420s**，以及**快速失败的 60s/180s 档**：用户选了
  对齐 300s。
- **额度 TTL 120s**：用户选了 60s。
- **单独的 fleet-report 脚本**：用户选了扩展现有分析器。
- **存量导入登录的迁移**：用户选了硬切（决定 9）。
- **Claude（anthropic-messages）开 1h TTL**：1h 写缓存按 2× 计费，而且不在 11 项范围内。
  GLM/Z.ai 是否接受 `ttl` 也没验证。
- **Ollama 上 glm-5.3-flash 的 3.3% 命中率**：上游根本不回缓存字段，是厂商侧问题。家族
  README 里「无文档化 cache-read」对 deepseek-v4.1-flash 已经过时（它会回 `cached_tokens`），
  随 08 的 PR 顺手修文档。
- **多账号在 429 / 额度耗尽时切换**：不在 11 项内。切换还会丢掉缓存亲和，将来要做就做成
  可选项。
- **Codex 每轮都重放 `x-codex-turn-state`、Codex WebSocket 传输、缓存保温 ping**：收益未证实。
  其中保温 ping 在 error.md（09-27）里已经否决过。
- **Command Code 按天变化的 `date` 字段、Codex 系统提示 pin、Cursor 当前轮 id 带 steps**：
  都是审计里的低优先项，也不在 11 项内。15 复测后如果数据指向它们，再单独立项。
- **审计里其他没有纳入的低优先项**：
  - Devin 在对话路径上同步签发 `user_jwt`：约 13.5 分钟有一次请求要多等约 2s；而且签发没有
    超时，读不到过期时间时 60s 的回退 TTL 比 90s 的复用余量还短。
  - 一个坏条目就会让整个 `auth.json` 解析失败，rename 前也没有 fsync。
  - Kimi 每次构建请求头都同步读一遍文件。
  - `/v1/models` 串行等待 13 个 `session()`。
  - 每次 `session()` 都要整份读取并校验 store，每次约 0.2–0.5ms。
  - Devin、Command Code、Kiro 的用量映射丢了 cache write 字段，分析器因此低估未命中。

  这些都不在 11 项内。先保留在这里，免得下一轮审计重新发现一遍。

## 需要改写的旧测试（不许删掉了事）

- `test/proxy.test.ts`：L4 的 import，L696 的 `CREATED` 夹具，L815–827 的空闲测试
  （`upstreamIdleTimeoutMs`），L878–883 的 `hasOutputEvent`，以及 L739–918 整个韧性测试块。
- `test/anthropic.test.ts`：L7、L302（`hasOutputEvent`）。
- `test/token-lifecycle.test.ts`：L424（「过期令牌总是重试刷新」）。
- `test/glm.test.ts`：L617、L652（`/^sess_/`）。
- `test/ui-client.test.ts`：L41（匹配 `document.hidden` 守卫的正则）。
- `test/command-code.test.ts`：L403（非 ok 状态与重试）。
- `test/outbound.test.ts`：所有注入 `agentFor` 的用例，它们掩盖了 F1。
- `test/cursor-transport.test.ts`，以及 proxy.test 里期望 SSE 错误块的 Cursor 用例。
