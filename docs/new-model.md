# 新模型接入

本文件回答一件事：**厂商发了新模型，怎么进到模型页**。目录行格式和合并规则的完整定义在 [`docs/models.md`](models.md)；本文件只写操作流程——探查、收不收、落到哪里。周期性全量刷新（"更新各家族模型"）的提速手册在[文末](#提速手册周期性全量刷新)。

## 第一步：对齐钉住版本（先于探测）

上游上新模型后，**先确认我们钉的客户端版本够新**——目录源往往按客户端版本分档下发，旧钉子会让新行从活目录里消失（codex 先例：`gpt-6.1-sol` 要 `client_version ≥ 0.159.0`，钉 0.155.1 探测就是"源里没有"，见 [`docs/error.md`](error.md) 2026-09-30）。

按家族查钉住的版本：

| 家族 | 钉在哪里 | 升到 |
|---|---|---|
| codex | `CODEX_CLIENT_VERSION`（`src/oauth/codex/index.ts`）+ UA | npm `@openai/codex` latest |
| command-code | npm `command-code` latest → `package/` bundle 重读 `pD`/`kr`/价目表 | npm latest |
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
| command-code | `manual`——没有模型端点，目录来自 CLI bundle 注册表 | 升 npm 钉住版本后重读 bundle（`pD` 注册表 + `kr` effort 表 + `kD/lD/…` 价目表），手改 |
| kimi / copilot 等 | 当前 profile 没有已存账号 → `SKIPPED` | 换 `--profile` 或登录一个账号再跑 |
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
| kimi / copilot `SKIPPED` | 该 profile 没有已存账号，换 `--profile` 或先登录 | models.md「更新流程」 |
| copilot `?` 一串（2026-10-03 实测 19 行：responses-only gpt 系 + grok×3 + `gpt-5.3-codex`/`gpt-5.4-nano`/`gpt-5.4-mini` + `sonnet-4.6` + `mai-code-1.1-flash` + `kimi-k2.7-code` + `gemini-3.5/3.6-flash`） | 能力视图不含它们：端点规则 + 账号/政策过滤，未确认下架不删 | copilot/README.md 模型 + docs/error.md 2026-09-30 |

### 探针的坑（都踩过一遍）

- devin 探 `GetCliModelConfigs`：照抄 `scripts/models.ts` 的 `session()`——传 `usable.session`，不是整行；漏配 `configureOutbound` 会挂在未决的 await 上。
- 判「目录有、源里没有」是不是真下架：直接打原始载荷看行是**整行没了**还是**变无家族**（devin 先例：`claude-sonnet-4.5` 两行 2026-10-01 整行消失，同代 opus-4.5 仍在 → 排除账号/出口过滤，随源删；无家族的 legacy 行本来就设计内不进目录）。
- npm pack 偶发网络错误（`npm view` 却通）：直接 `curl -sfL https://registry.npmjs.org/<pkg>/-/<pkg>-<ver>.tgz` 拿 tarball，别折腾 npm 配置。
- opencode.ai 按 UA 指纹回 Cloudflare 1010 拦 python urllib，curl 可过；出站请求必须带 `x-opencode-session`。
- cursor docs 的 `.md` 表 WebFetch 会 404，curl 直接拿；窗口列不在 pricing 表里，在 `/docs/models/<slug>.md` 页（slug 以 `docs/llms.txt` 为准）。
- 新收 completions 行先发一条最小活测，看回包有没有 `reasoning_content`——有就是 DeepSeek 方言，compat 不能用默认 plain（opencode-go/README.md 模型）。
- copilot 探查只认 `tid=` session：`gh` 和 `@github/copilot` CLI 的 token 都是 `gho_`，`/copilot_internal/v2/token` 一律 403（CLI 的在 login keychain，服务名 `copilot-cli`，两条目同值）；设备码（`copilotDeviceSpec`）是唯一换票路径。premium 0% 的账号所有非基础模型回 `400 model_not_supported` 不是 429，活测前先查 `copilot_internal/user`（docs/error.md 2026-09-30）。

### command-code 升钉 = 重读 bundle（最大的单块工作）

先读 npm 包自带的 `CHANGELOG.md`（哪版加了什么模型一眼便知），再 `npm pack` 新旧两版对照。bundle 里按**结构指纹**定位，别找变量名——`pD`/`kr`/`Mr` 这类名字每版都换，形状不变：

- 注册表行：`NAME:{id:"…",inputModalities:[…],reasoningEfforts:[…],contextWindow:N[,maxOutputTokens]}`。hidden 集认成员不认名字：那个装着 `minimax/*-free`、`meituan/LongCat-2.0:free`、`inclusionai/ling-3.0-flash-free`、`tencent/Hy3` 的 `new Set` 就是它（sante / laguna / 新 free 行不在集里，照收）。**定位坑**：按成员串 grep 会先命中一个装着全部已知 id 的大数组（`listKnownModelIds` 用）；真 hidden 集是紧邻 `listSelectableModelIds` 的**短** `new Set`，且首个成员可能是变量引用（`fo` → `MiniMaxAI/MiniMax-M3-Free` 隐藏别名，解析后才知道，对账时算 unique 成员）。**退役信号**：行内出现 `get hidden(){return isXxxEnded()}` 且函数体是 `Date.parse("…Z")` 比较——日期门控退役（pixel-canary 先例 2026-10-01），门一过 CLI 就隐藏，目录随删，不用等 CHANGELOG 措辞。
- 别按字段顺序写死正则：行里还混着 `provider`/`spec`/`label`/`name`/`description`，`contextWindow` 可写成 `1e6`，直连 provider 的个别行整个没有 `contextWindow`，价目对象还夹着 `provider:"字符串"`/`category`、`contextTiers` 里是嵌套大括号——按字段顺序或 `[^{}]*` 的正则会漏行（2026-09-30 实测：正则 79+31，平衡大括号 87+35）。从 `{id:"…` 起、按平衡大括号收整对象，再按内容（`inputModalities` / `promptCost`）分类；diff 前先把压缩名（`provider:XX,spec:YY`）和 `1e6` 这类数字写法归一化。提取完对账：unique id 数 − hidden 集成员数 = 目录行数，对不上就是又漏了。单行压缩 bundle 上 `grep -c` 数的是行数（恒 1），数出现次数用 `grep -o | wc -l`。
- 价目表：1.74.1 起是**一张按 billing id 的单表**（`{"<billing id>":{inputCost,outputCost,cacheReadCost[,cacheWriteCost][,cacheWrite1hCost]}}`，`getDisplayRates` 直接查它，不再有 `contextTiers` / `timeOfDay`）；1.73.1 及以前是 `kD` 网关表 + `lD`/`xD/CD/bD/ED/TD/MD` 多张 `{id:"<gateway>:<model>",promptCost,completionCost,cacheWrite5mCost,cacheWrite1hCost,cacheHitCost[,contextTiers]}` 表。**新旧两版全量提取再 diff**，加/删/改价一目了然，比逐行人工核对快一个量级；单表的 billing id 有两种键形（`provider:model` 与 `<Vendor>/<Model>`），与目录行的对应关系手工对（rates.json 的键是目录 id）。
- wire 是否变了：比对 `/alpha/generate` 前后几百字符，逐字一致（只差压缩名）即可放心升钉。
- 行级 `maxOutputTokens`（ling 免费行的 32768 等）按本家既定规则**不**写进行（command-code/README.md 模型）。

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

同期各源：grok/kiro/antigravity/cline/ollama/opencode-go 都没有；command-code 的 CLI bundle（钉住 1.69.0）注册表和价目表都没打包 6.1——这就是「目录源没有就只能等上游」的情形。codex 第一遍也没报，但不是没有——钉住的 `CODEX_CLIENT_VERSION=0.155.1` 低于 6.1 的下发门（≥ 0.159.0），升到 npm latest 后 `+ gpt-6.1-sol`（272K/872K、image、off–max、`fastTier`→自动孪生 `-fast`）就出现了。copilot 的活载荷也列了 `gpt-6.1-sol`，但 `supported_endpoints` 只有 `/responses`——hop 只说 completions，拒收（端点规则先例，copilot/README.md 模型）。
