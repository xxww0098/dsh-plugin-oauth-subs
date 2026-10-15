# 新模型接入

本文件回答一件事：**厂商发了新模型，怎么进到模型页**。目录行格式和合并规则的完整定义在 [`docs/models.md`](models.md)；本文件只写操作流程——探查、收不收、落到哪里。周期性全量刷新（"更新各家族模型"）的提速手册在[文末](#提速手册周期性全量刷新)。

## 第一步：对齐钉住版本（先于探测）

上游上新模型后，**先确认我们钉的客户端版本够新**——目录源往往按客户端版本分档下发，旧钉子会让新行从活目录里消失（codex 先例：`gpt-6.1-sol` 要 `client_version ≥ 0.159.0`，钉 0.155.1 探测就是"源里没有"，见 [`docs/error.md`](error.md) 2026-09-30）。

按家族查钉住的版本：

| 家族 | 钉在哪里 | 升到 |
|---|---|---|
| codex | `CODEX_CLIENT_VERSION`（`src/oauth/codex/index.ts`）+ UA | npm `@openai/codex` latest |
| command-code | npm `command-code` latest → `package/` bundle 重读内嵌目录与 `pricing` | npm latest |
| 其余 | 走活端点，不钉版本 | — |

版本对了再探测；版本对不上，探查结果不可信。

## 第二步：探查

```sh
npm run build                # 脚本 import 编译后的 lib/
npm run models               # 干跑：所有家族逐键打差异
npm run models -- <id>[,…]   # 只看某几家（如 cursor,devin）
```

脚本对每个家族跑它的**一线目录源**（`ADAPTERS` 里钉的那个），把「源里有、目录没有」的行打成 `+`，把参数变化打成 `~`，把目录有源里没有的打成 `?`。新模型的发现就是找 `+` / `!` / `>` 行。

**命令行口径**：模型 id 里的点（`gpt-6.1-sol`）多数适配器保留点（codex 行就是 `gpt-6.1-sol`），devin 那类归一成连字符（`gpt-6-1-sol`）；报告里按各家的写法出现。

**探查不出来的家族**：

| 家族 | 原因 | 怎么办 |
|---|---|---|
| command-code | 公开 `GET /provider/v1/models` 只报成员和窗口；effort、模态、价在 CLI bundle | 升 npm 钉住版本后重读 bundle 内嵌目录，手改静态楼与价目 |
| kimi 等 | 当前 profile 没有已存账号 → `SKIPPED` | 换 `--profile` 或登录一个账号再跑 |
| cursor 等精选键 | 新 id 打 `>` 只报告不写入 | 按该家 README 的精选规则手动挑 |
| ollamaRetired | 退役清单，不是活目录 | 退役公告时手改 |

## 第三步：判收不收

报告符号的含义在 [`docs/models.md`](models.md#报告符号)。收新行前必须回答：

- **订阅后端真在服务它吗？** 端点列出来 ≠ 套餐能用（GLM 的 `glm-4.x` 历史 id、cursor 精选键整页不报新行都是先例）。目录有、后端不认的行先例是 `gpt-5.3-codex`，用 `skip` 写明理由拒收。
- **参数有出处吗？** 只给 id 的源（GLM、OpenCode Go）要去第二源补参数；补不到就是 `!` unresolved，**手找有出处的参数后手加，不许发明数字**。干跑报告会在 `!` / `>`（目录里还没有的 id）行下方给一条 `i models.dev: …` 跨桶多数值提示——只当找第二源的线索，出处仍以厂商页为准（[`models.md`](models.md#报告符号)）。
- **窗口口径对吗？** 源给的总窗不一定是 DSH 要钉的默认输入窗（opencode-go 的 `gpt-6-luna` 源报 1.05M、目录钉 258K）。要钉上限用 `keep` 规则并在家族 README 记理由。
- **fast / thinking 变体是真变体吗？** Devin 的 `-fast` / `-thinking-fast` 是有后端 uid 的独立行（`variants` + `defaultUid`），Codex 的 `fastTier` 是开关语义——别把"名字像 fast"当变体收。

## 第四步：落地清单

| # | 文件 | 动作 | 什么时候需要 |
|---|---|---|---|
| 1 | `src/catalog/models.json` | `npm run models -- --write` 自动把新行插到最前面 | 每次 |
| 2 | `src/catalog/rates.json` | `npm run rates -- --write` 重写价目行（command-code 手抄 CLI 表；字段与源见 models.md 末节） | 干跑报告里新行不在「no price」里，或确认源里确实没价 |
| 3 | 家族 README「模型」节 | 记日期、源、这次收了什么；拒收的行写成 `skip` 规则 + 理由 | 每次 |
| 4 | `docs/error.md` | 有用户可见变化（新模型上线、窗口口径修正）记一笔 | 有变化时 |
| 5 | `test/catalog*.test.ts` | rates 行进覆盖测试；被 `keep`/`skip` 的行有对应单测先例 | 有 rates 或特殊规则时 |
| 6 | `npm run build && npm test` | 加载器校验 `models.json` 和 `rates.json` 一起过 | 每次 |

**不需要动的**：`FAMILY_IDS` / picker 接线 / UI——新行沿用家族已有接线，自动出现在模型页并被默认勾选（`ModelSwitch` 对已结算的家族全部默认开；正在等勾选的登录家族例外，见 [`models.md`](models.md) 「登录默认」）。

## 提速手册（周期性全量刷新）

全量刷新的流程就是上面四步：对钉 → 干跑 → 裁定 → 落地。慢的从来不是跑脚本，是把下面这些事实**重新发现一遍**——它们各有正主，本节只给指针和不会随版本烂掉的定位法，不复制内容。

### 开工三条

```sh
npm view @openai/codex version && npm view command-code version  # 对照钉住的版本够不够新
npm run build && npm run models                                  # 干跑报告
grep -rn "<旧版本号或被改的数值>" src test docs | grep -v lib/    # 所有钉着该字面量的引用点
```

版本钉**不是一个常量的事**：常量本体在 `src/oauth/codex/index.ts` 的 `CODEX_CLIENT_VERSION` 与 `src/apikey/command-code/index.ts` 的 `COMMAND_CODE_CLI_VERSION`，但家族 README、`docs/oauth.md` 总表、`src/catalog/index.ts` 注释、测试里的 UA 断言钉着同一个字面量；测试还钉**行数与窗口值**（`models.length, N`、`contextWindow, N`），目录一变就断。永远用 grep 找，不靠记忆列清单——清单会烂，grep 不会。

### 裁定速查：设计内的差异不要重新查

| 报告里看到 | 结论 | 正主 |
|---|---|---|
| kiro `? claude-fable-5` | 有意加的兼容 id，保留 | kiro/README.md 模型 |
| kiro `claude-sonnet-5.5` | 已在静态 fallback。chat 列表仍没有，登录选择器不要补这一行，也不要再加 `skip` | kiro/README.md 模型 |
| antigravity `?` Claude 4.6 两行 | 活 `fetchAvailableModels` 仍在服务，注册表已不列也不要 `--prune`。5.5 的 `-high` 行已按注册表收入 | antigravity/README.md 模型 |
| chatgpt `? gpt-6.1-sol` 等 1–4 行（同日会摆动） | 登录态端点按账号 / 当天过滤；`gpt-5.5` 已活测仍在服务（2026-10-08），不删 | chatgpt/README.md 模型 + docs/error.md 2026-10-08 |
| codex `? gpt-5.5` | 活测 200 `response.completed`（2026-10-08），列表过滤不是下架，不删 | codex/README.md 模型 |
| cursor 一串 `>` | 精选键只报告不写入，按 docs 表手挑 | cursor/README.md 模型 |
| opencode-go 想删 curl 直接能看到官方页面列着的 id | 无认证列表是公开缓存视图，带 key 的才是订阅视图 | docs/error.md 2026-09-30 目录刷新日 |
| 同一家族同一天两次结果不一样 | 上游当天就能增删档位/变体，快照≠稳定态 | docs/error.md 2026-09-30 目录刷新日 |
| kimi `SKIPPED` | 该 profile 没有已存账号，换 `--profile` 或先登录 | models.md「更新流程」 |
| cline `? spacexai/grok-4.7` | feed 已改列 `x-ai/grok-4.7`；旧 id 活测仍 200（2026-10-10），不 `--prune` | cline/README.md 模型 |

### 探针的坑（都踩过一遍）

- devin 探 `GetCliModelConfigs`：照抄 `scripts/models.ts` 的 `session()`——传 `usable.session`，不是整行；漏配 `configureOutbound` 会挂在未决的 await 上。
- 判「目录有、源里没有」是不是真下架：直接打原始载荷看行是**整行没了**还是**变无家族**（devin 先例：`claude-sonnet-4.5` 两行 2026-10-01 整行消失，同代 opus-4.5 仍在 → 排除账号/出口过滤，随源删；无家族的 legacy 行本来就设计内不进目录）。
- npm pack 偶发网络错误（`npm view` 却通）：直接 `curl -sfL https://registry.npmjs.org/<pkg>/-/<pkg>-<ver>.tgz` 拿 tarball，别折腾 npm 配置。
- opencode.ai 按 UA 指纹回 Cloudflare 1010 拦 python urllib，curl 可过；出站请求必须带 `x-opencode-session`。
- cursor docs 的 `.md` 表 WebFetch 会 404，curl 直接拿；窗口列不在 pricing 表里，在 `/docs/models/<slug>.md` 页（slug 以 `docs/llms.txt` 为准）。
- 新收 completions 行先发一条最小活测，看回包有没有 `reasoning_content`——有就是 DeepSeek 方言，compat 不能用默认 plain（opencode-go/README.md 模型）。

### command-code 升钉 = 重读 bundle（最大的单块工作）

先读 npm 包自带的 `CHANGELOG.md`，再 `npm pack` 新旧两版对照。bundle 是单行压缩的 `dist/cli.mjs`，变量名每版都换，按结构指纹找：

- **1.82.3 起目录是内嵌 JSON**，不是 `NAME:{id,…}` 对象表。指纹是 `JSON.parse` 附近的 `schemaVersion:1` 加 `"data":[`。每行有 `id`、`name`、`context_length`、`inputModalities`、`reasoningEfforts`、`hidden`、`pricing`、`maxOutputTokens`。可选性看行上的 `hidden`（`resolveCatalogModelStatus(...).state === "selectable"`），不要再找 hidden `Set`。公开 `GET /provider/v1/models` 的 90 行应与可见行逐 id 相同；它不带 effort 和模态，静态楼这两项仍从内嵌目录补。
- **1.82.1 及以前**才是 `NAME:{id,inputModalities,reasoningEfforts,contextWindow}` 注册表，外加紧邻 `listSelectableModelIds` 的短 hidden `Set`（按成员串 grep 会先命中 `listKnownModelIds` 的大数组）。日期门 `get hidden(){return isXxxEnded()}` 仍可能在，但 1.82.3 的免费 Ling 退役是行上 `hidden: true`，不是新日期门。
- 价：1.82.3 起在目录行的 `pricing`（`inputCost` / `outputCost` / `cacheReadCost` / `cacheWriteCost`），`getDisplayRates` 已不在。1.74.1–1.82.1 是 billing id 单表；更早是 `kD`/`lD` 多表。新旧两版全量提取再 diff。billing id 可能带 `provider:` 前缀，rates.json 的键是目录 id。
- wire 是否变了：比对 `/alpha/generate` 前后的 body（`max_tokens ?? 64e3`、`reasoning_effort`、顶层字段）和请求头名。逐字一致（只差压缩名和版本字面量）即可升钉。
- 行级 `maxOutputTokens` 按本家既定规则**不**写进行（command-code/README.md 模型）。

### 落地时容易漏的

- 手删目录行后，rates.json 里同名价目行会让加载器直接抛——这是设计，同步删（models.md「费率表」）。
- `npm run rates -- --write` 会重写脚本管的键；command-code 键是手抄，脚本不碰。
- 收/删了行要在家族 README「最近核对」写日期与内容；用户可见变化记 `docs/error.md`；两处都有先例可抄格式。

## 完整先例：GPT-6.1 Sol（2026-09-30）

`npm run models` 干跑只在 **devin** 源（`GetCliModelConfigs`）里探出三个新行，带齐参数（1M 窗 / 128K 输出 / image / 六档 effort → priority uid）：

- `gpt-6-1-sol`：`off…max` → `*-none…-max` uid
- `gpt-6-1-sol-fast`：`low…max` → `*-priority` uid（后端真 Fast 变体）
- `gpt-6-1-sol-thinking-fast`：`reasoningEfforts: false`，`defaultUid: gpt-6-1-sol-none-priority`

**当天后续**：Devin 源在几小时内撤掉了 `off`（`*-none`）档与 `-thinking-fast` 行（只剩 low–max 与 `-fast`），目录随源收掉；command-code 升钉 1.72.2 后也从 CLI bundle 收到 `gpt-6.1-sol`（1.70/1.71.0），cline feed 同日上了 `openai/gpt-6.1-sol`。教训有二：**先对齐钉住版本，再下"源里没有"的结论**；**上游当天就能增删档位/变体，收行当天的快照不代表稳定态**（复核见 [`docs/error.md`](error.md) 2026-09-30 目录刷新日）。

同期各源：grok/kiro/antigravity/cline/ollama/opencode-go 都没有；command-code 的 CLI bundle（钉住 1.69.0）注册表和价目表都没打包 6.1——这就是「目录源没有就只能等上游」的情形。codex 第一遍也没报，但不是没有——钉住的 `CODEX_CLIENT_VERSION=0.155.1` 低于 6.1 的下发门（≥ 0.159.0），升到 npm latest 后 `+ gpt-6.1-sol`（272K/872K、image、off–max、`fastTier`→自动孪生 `-fast`）就出现了。
