# 模型目录与更新

本文件是**模型目录**的唯一规范：目录长什么样、每个键的数据从哪来、怎么用脚本更新、合并时哪些判断不能交给脚本。
每个模型参数的出处与取舍仍记在家族 README 的「模型」节；本文件不重复它们。

| 看什么 | 去哪 |
|---|---|
| 行数据本身 | [`src/catalog/models.json`](../src/catalog/models.json) |
| 费率表（可选、展示用） | [`src/catalog/rates.json`](../src/catalog/rates.json)（见末节） |
| 加载 / 校验 / 冻结 | [`src/catalog/index.ts`](../src/catalog/index.ts)（`assertCatalog` + rates 校验） |
| 合并规则的实现 | [`src/catalog/merge.ts`](../src/catalog/merge.ts) |
| 每个键的来源与适配 | [`scripts/models.ts`](../scripts/models.ts) 的 `ADAPTERS` |
| 单个参数为什么是这个数 | `src/oauth/<id>/README.md` / `src/apikey/<id>/README.md` 的「模型」节 |
| 目录之后：接线、渲染、费率 | [`docs/new-family.md`](new-family.md)「模型参数 → 模型页」；自定义窗口见本文件末节 |
| 新模型的探查与收录流程 | [`docs/new-model.md`](new-model.md) |

## 两层目录

- **静态目录**（`models.json`）：离线底表，也是未登录时模型页列出的行。登录前、活目录失败或为空时就用它。
- **活目录**（各家 `<id>/catalog.ts` 的 `refresh<Id>Catalog`）：登录后运行时从厂商拉取，替换静态行进 picker 与 `settings.yaml`。活目录只在内存里，不写回 JSON。

脚本把「活目录此刻看到的」落回静态层。两层读同一个源、用同一个解析器（脚本直接调用家族的 `to<Id>PickerModels` / `fetch…`），所以离线底表与运行时 picker 不会各说各话。

## 行格式

单文件、顶层家族键、平铺行（形状对齐 CLIProxyAPI `internal/registry/models/models.json`）。行字段即 DSH 路由字段，没有映射层：

| 字段 | 语义 | 约束 |
|---|---|---|
| `id` / `name` | 线上 id / 模型页美化名 | 家族内唯一；`settings.yaml` 别名另由 `harnessModelAlias` 生成，与 `name` 无关 |
| `contextWindow` | DSH 压缩对齐的**默认输入窗** | 正整数；不一定是厂商总窗（见下「不能交给脚本的判断」） |
| `maxTokens?` | 厂商输出上限 | 路由侧被 `HARNESS_REQUEST_MAX_TOKENS` 截成单次请求预算 |
| `input?` | `text` / `image` 子集 | 缺省 = text+image；audio / video / pdf 一律剥掉 |
| `reasoningEfforts?` | DSH 档位 → 厂商拼写 | 键只取闭集 `off…max`；值是厂商拼写或 `null`；非推理模型为 `false` |
| `maxContextWindow?` | 该行自定义窗口的上限（按家族查，`familyMaxContextWindow`） | codex / glm / copilot / devin / cline / command-code / ollama |
| `fastTier?` | 是否长 `-fast` 孪生 | codex |
| `variants` / `defaultUid` | 档位 → 后端 uid | devin |
| `compat` | pi-ai completions 方言 | opencode-go |

键集合固定（`CATALOG_KEYS`）：每个家族一个键，OpenCode Go 按协议拆成 `opencode-go-flash` / `opencode-go-responses`，`ollamaRetired` 是退役 id 数组。加载器在模块加载时校验，有一行不合法就整体抛错，绝不静默沿用旧目录。

## 加一个新模型 / 新家族

「给模型页加一行」需要动的地方固定就这几处，按顺序落地（新家族是同一套步骤，只是第 1 步从「在已有键加行」变成「加新键」）：

| # | 文件 | 加什么 | 门禁 |
|---|---|---|---|
| 1 | `src/catalog/models.json` | 新行 / 新家族键（行字段见上表）；新家族同时在 `CATALOG_KEYS` 登记 | `assertCatalog` 通过（`npm run build` 时加载器会拦） |
| 2 | `src/catalog/rates.json` | `npm run rates -- --write`（command-code 手抄 CLI 表）；行形 `{in, out, cacheRead?, cacheWrite?, cacheWrite1h?, tod.peak?, tod.offPeak?, tierThreshold?, tiers?}` | id 必须命中 models.json 行或其 `-fast` 孪生；源里没价就不写（不出徽标） |
| 3 | `scripts/models.ts` | `ADAPTERS` 加该键的 `source` / `fetch`（有活端点）或 `manual`（无端点，出处写 README） | `npm run models` 干跑不报 `unresolved` 外的错 |
| 4 | `src/<family>/index.ts` | `<ID>_MODELS = catalogRows('<id>')`（新家族；已有家族加行不用动） | — |
| 5 | `scripts/rates.ts` | 新家族才需要：`resolvers` 加该键的价目源（`controller.ts` 经 `catalogPricing()` 自动带全部家族） | 干跑报告里该键行数 > 0 |
| 6 | `src/oauth/models.ts` | 新家族才需要：`FAMILY_IDS` / `familyOfProvider` 后缀 / `HARNESS_MODEL_AGENT` | picker 键归对家族 |
| 7 | 家族 README | 每行参数的出处（哪张表 / 哪个端点 / 哪次核对）；rates 数字的出处写进「归因」表 | 不许发明数字 |
| 8 | `test/<id>.test.ts` / `catalog-rates.test.ts` | 新行进 picker、rates 键覆盖、路由行不带 `pricing` | `npm test` 绿 |

- **已有家族加模型**：做 1、2（重跑 `npm run rates`）、7，其余不动。
- **徽标只在有 rates 行时渲染**：源里确实没价（如 Kimi `kimi-for-coding`、Devin Fusion）就没有，干跑报告会列出来。
- **Kiro 的 `rate` 倍率不走这张表**：它是订阅积分倍率（`rateMultiplier`），展示为 `×N` 徽标，由活目录的行字段带出，不要混进 `rates.json`。

## 来源

每个键的一线来源按可信度排：**厂商目录端点 > 钉住客户端自带的列表 > 公开注册表 / 文档**。厂商端点优先，因为它就是订阅后端实际服务的列表，文档会滞后，也常常只列部分模型。当前每个键接的是哪个源，以 `ADAPTERS` 的 `source` 为准；源分三类：

- **登录态端点**：要一份已存账号。多数端点按账号、套餐或出口区域过滤（Kiro 与 Cursor 的列表随出口 IP 变化），所以脚本从某次拉取里看到「缺行」，不等于该模型已下架。Copilot 先例：grok 整族只按政策开关出现、premium 耗尽的账号所有非基础模型回 `400 model_not_supported`（[error](error.md) 2026-09-30）。
- **公开端点 / 注册表**：不需要登录（Cline feed、Ollama `/api/tags` + `/api/show`、CLIProxyAPI registry、models.dev）。
- **无端点**（`manual`）：Command Code 只有 CLI bundle 里的注册表，`ollamaRetired` 来自退役公告。这两个键手改，出处照旧记进 README。

有的端点只给 id（GLM、OpenCode Go），参数要从第二个源补（OpenCode Go 用 models.dev `opencode-go` 桶）。补不到参数的新 id 报 `unresolved`，不写入——不发明数字。

## 更新流程

```sh
npm run build                      # 脚本 import 编译后的 lib/
npm run models                     # 干跑：逐键打印差异，不写文件
npm run models -- codex,kiro       # 只看部分键
npm run models -- --write          # 写回 src/catalog/models.json
npm run models -- --write --prune  # 另外删掉源里已消失的行（先读下文）
npm run models -- --json           # 机器可读报告
```

`--profile` 选读哪个 profile 的凭据（默认 `desktop`）。脚本对账号只读：不刷新令牌（2 分钟内过期的账号直接跳过，开一下应用让它自己刷新）、不写 store；拉模型列表不耗额度。出站走插件的 `outbound-proxy.json` 与 `HTTPS_PROXY`，要看非中国大陆出口的列表就配好代理再跑。

跑完以后：

1. 逐条读干跑报告，按下节判断每条差异该不该收。
2. `--write`，然后 `npm run build`（JSON 会发射到 `lib/catalog/`）。
3. 在家族 README「模型」节写下日期、源和这次收了什么；有用户可见变化的在 `docs/error.md` 记一笔。
4. `npm test`，把 `src/catalog/models.json` 和重建的 `lib/` 放进同一个 PR 提交。

退出码：有键失败为 1（`SKIPPED` / `MANUAL` 不算失败）。

### 报告符号

| 符号 | 含义 | 你要做什么 |
|---|---|---|
| `+` | 新行（`--write` 会插到该键最前面） | 确认订阅后端真在服务它；补 README 出处 |
| `~` | 已有行的字段变了（会写入） | 核对是厂商改了，还是源的口径与目录不同 |
| `=` | 源值不同，但被 `keep` 规则钉住 | 规则背后的理由还成立就不用管 |
| `?` | 目录有、源里没有 | 先排除账号 / 出口过滤；确认下架才 `--prune` 或手删 |
| `!` | 新 id，但源没给参数 | 找到有出处的参数后手加 |
| `>` | 精选键，新 id 只报告不写入 | 按该家 README 的精选规则手动挑 |
| `i` | models.dev 跨桶提示（只跟在 `!`/`>` 后，目录里还没有的 id）：窗口 / 输出 / effort 的多数值与同意桶数（平票取小窗 / 短档） | 只当找第二源的线索，出处仍以厂商页为准，不直接抄进目录 |
| `·` | 被 `skip` 规则跳过 | 规则理由失效时删掉那条规则 |

## 合并规则

规则实现在 `merge.ts`，测试在 `test/catalog-merge.test.ts`：

- **源有值就以源为准，源没有的字段保留目录值。** 很少有源字段齐全（Codex 端点没有输出上限，Grok 没有输入种类），缺字段不能当成「删掉」处理。
- **`name` 由人维护。** 源里的名字只用在新行上（`GPT-6-Sol` 不会覆盖 `GPT-6 Sol`）。
- **比较按语义做**：effort 键的顺序、`input` 的顺序、省略 `input` 与写满 text+image，都算相等，不产生噪声差异。
- **已有行的顺序就是 picker 顺序，保持不动；** 新行按源里的顺序插到最前面，让新模型排在 picker 顶部。
- **缺行默认只报告，不删除。** `--prune` 才删。
- **写之前先跑 `assertCatalog`。** 合并结果不过加载器校验就不落盘。

## 不能交给脚本的判断

脚本只负责搬数，下面这些判断属于维护者，要在适配器里写成规则（`keep` / `skip` / `newRow` / `add: false`），并在家族 README 写明理由：

- **默认窗口不一定等于厂商总窗。** DSH 按 `contextWindow` 触发压缩，报总窗会让长会话长到被网关拒绝。例子：Codex 用 CLI 的 258K 可用输入而不是原始的 272K（新行由 `newRow` 填），Copilot 的 GPT 行钉 256K 默认窗、厂商大窗挂 `maxContextWindow`（`newRow`），OpenCode Go 的两行 Luna 钉在 258K（`keep`），GLM 套餐窗是 400K，1M 只作为 `maxContextWindow` 上限。
- **厂商列出的，不等于订阅能用的。** 历史改道 id、未上套餐的 id、同一模型的别名，都用 `skip` 写明理由（GLM、OpenCode Go 有先例）；后端返回 400 的模型不进目录（`gpt-5.3-codex` 先例）。
- **精选键**：Cursor 的底表跟官方 docs 表走，活列表里还有隐藏行和旧行，所以新 id 只报告（`add: false`）。
- **方言**：OpenCode Go 的新行默认按普通 OpenAI compat 处理；DeepSeek 方言要先活测确认再手改。
- **某个源的口径和目录不一致时，改适配器，不改规则。** 比如 Cline 只按 id 末段匹配 models.dev，能匹配到别的厂商的同名行，这种差异在报告里核对后拒收即可，别为它放宽合并规则。

## 自定义窗口

目录的 `contextWindow` 是基线，脚本只更新它。用户可以在模型页按行把输入窗口改大或改小，不用等目录更新（GLM 这类套餐降窗的场景就靠它）。

- **每个模型一行，不派生窗口变体行。** 要大窗就把这一行改大，上限是该行的 `maxContextWindow`（没有就是 `contextWindow`）；`-fast` 孪生行和基线行共用上限，但各自独立覆盖。
- **覆盖是用户数据，不是目录。** 存在插件数据目录的 `models.json` 里（`ModelSwitch`），不写回 `src/catalog/models.json`；它也不算启停选择，不影响「全部关掉后自动恢复」的逻辑。
- **只在路由写出的那几个接缝上生效**（`applyContextOverrides`），压缩余量从覆盖后的窗口推导，所以宿主压缩会跟着改过的窗口走。
- **残留的窗口后缀。** settings.yaml 里带 `-900k` / `-1m` 的路由行会在 sync 时清掉，hop 仍会剥这些后缀以兼容残留请求。Devin 目录里本身就以 `-1m` 结尾的真实 id 是普通行，不受影响。
- **没有第二档窗的家族照样可以手填上限。** devin / cline / command-code / ollama 的上限槽已接通（`familyMaxContextWindow` 按家族查静态楼，活目录按 row id 把上限带过来），但这四家的源各自只给一档窗（CLI config / models.dev `limit.context` / CLI 注册表 ctx / `/api/show` `context_length`），所以行上目前都没有 `maxContextWindow`；要挂就把维护者钉的数字连同出处在家族 README 记下。

模型页上窗口徽标的交互见 [`design-system/pages/settings-workbench.md`](../design-system/pages/settings-workbench.md)。

## 费率表（rates.json）

`src/catalog/rates.json` 是模型页价格 tooltip 的数据源（金币徽标 → USD / 每百万 token），**只服务展示**，不进路由行。它和 `models.json` 分开是因为粒度不同：目录行是路由形状，费率行是计费形状，来源和更新节奏都不一样。

- **键对齐目录**：`<家族>/<模型 id>`，id 必须命中 `models.json` 行，或是运行时长出的 `<id>-fast` 孪生（Codex `fastTier`、Cursor 活目录 Fast）；加载器按此校验，多一个就抛。
- **接线**：`controller.ts` 把 `catalogPricing()`（全部家族）喂给 `describeCatalog` 的 `pricing`；共享 `timeOfDay` 由 `pricingTimeOfDay` 一次性带下去。
- **行字段**：`in` / `out` 必填（主 upstream 的 USD/1M）；源标了缓存命中价才有 `cacheRead`（缺 ≠ 免费，tooltip 不显示该行）；上游对缓存写计费才有 `cacheWrite` / `cacheWrite1h`；峰谷价的行带 `tod.peak` / `tod.offPeak`（共享的时刻表在顶层 `timeOfDay`：生效日、UTC 峰时窗、峰时星期、指定整日按谷价的日期）；`tierThreshold` / `tiers` 描述上下文超阈后的加价档（只收单档）。
- **出处即上游价目表**，不许发明数字：command-code 抄 CLI bundle 的显示费率表（kD 网关表 → lD 各 provider 表 → xD/CD/bD/ED/TD/MD 直连表，`getDisplayRates` 同序取主 upstream），升级钉住版本时要重新对表。其余家族由 `npm run rates`（`scripts/rates.ts`）从各家源写入，每家的源与 id 映射写在脚本的 `resolvers` 和家族 README「归因」：

| 家族 | 价目源 |
|---|---|
| Cursor | 官方 [models-and-pricing](https://cursor.com/docs/models-and-pricing.md) 表（按行名）；`-fast` 取 `<name> (Fast)` 行，没有独立行的取基础行 × notes 写明的倍数（"Fast mode is available at Nx pricing"，如 GPT-5.6）；notes 无倍数出处的不派生 |
| Devin | 官方 [models](https://docs.devin.ai/desktop/models.md) `modelCostData`，Pro 档，按 `defaultUid` |
| Copilot / Ollama / OpenCode Go | models.dev 本家桶（`github-copilot` / `ollama-cloud` / `opencode-go`） |
| Codex / Grok / GLM / Kimi / Antigravity | models.dev 厂商桶（`openai` / `xai` / `zai` / `moonshotai` / `google`+`anthropic`）；Codex `-fast` 取 `vercel` priority 行；Grok 真后端 Fast（`grok-4.7-build-fast`）= 基础行 × 2（上游 picker 自述 "Fast variant. 2x the price."） |
| Kiro | models.dev `amazon-bedrock` `global.*` 端点 |
| Cline | feed `free` 组 $0，其余 models.dev `openrouter` |

  本家源没价的行回落同一模型的厂商标价（`vendorIndex`，Kimi 除外：它的 id 是套餐别名），干跑报告用 `~` 列出来逐条核对；`-fast` 只匹配 `-fast` 标价，不借基础价。订阅家族的标价是厂商按量价，不是订阅扣费（Kiro 另有 `×N` 积分倍率）。
- **Kiro 的 `rate` 倍率是另一回事**：那是订阅积分倍率（`rateMultiplier`），不是 USD 价目，仍走目录行旁的 `×N` 徽标，不写进本表。
- **用量页的「估算成本」也读这张表**（`src/utils/usage-cost.ts`，读时计价：改价目即重述历史，不落任何金额）。口径：小时行没有单次上下文，`tierThreshold` 按该行平均 prompt（input + 缓存读 + 缓存写 ÷ 调用数）判定并整行套用；`tod` 按行的 UTC 小时落峰/谷档；源没列的缓存价按 `in` 折算（缺 ≠ 免费，估高不估低）；`cacheWrite` 缺时用 `cacheWrite1h` 再退 `in`；无价目行的模型不计入（页上显示为 — 与「x/y 模型有价目」，$0 价行算有价）。`opencode-go` 的用量行查 flash / responses 两张表；旧的 `-900k` / `-1m` 路由 id 按剥离后基名取价。

## 默认档位

模型页工具栏的「默认档位」按家族定一个缺省思考档：左栏选「全部」时统一写所有家族（覆盖各家族单独的设置），选中某个家族时只写这一家（OpenCode Go 两条路由一起）；各家不一致时「全部」显示「混合」。在 DSH 选择器里手选的档仍然优先。和自定义窗口一样是用户数据（`models.json` 的 `efforts`，按家族 id 存），只在两个路由写出点生效（`syncHarnessModels` / `ensureOpencodeGoRoute`，都走 `withDefaultEffort`），不改目录行。选完先在界面上立即显示，路由重写要等宿主 settings 重载（几秒），失败才回退；一次同步只写一次 llm-pi-ai（OpenCode Go 路由搭在家族路由那次写入里，`ensureOpencodeGoRoute` 的 `apply: false`），宿主只重载一次。

- **DSH 只有家族级默认档**：provider 的 `reasoning`，模型行没有这个字段。它同时是选择器里的默认档，也是没选档时请求用的档。
- **DSH 不退档**：模型没声明的档，选择器不会把它当默认，请求直接报 `UNSUPPORTED_REASONING_EFFORT`。所以写路由时，给缺这一档的模型补一个同名键，值取它自己最近的一档：先往下找，除非选的就是 off，否则不落到 off；下面没有再往上。选择器里会多出这一档，实际发的是补上的值。
- **家族里有不支持思考的模型（`reasoningEfforts` 为 `false` 或缺省），整个家族不写默认档**：否则 DSH 会拒掉那个模型所有没选档的请求。
- 换模型时 DSH 用新模型的默认档；每次选择还会存成新会话的默认（`agent-default-model`）。所以这里的默认档只管「没手选」的情况。

## 登录默认（勾选）

模型页的勾选（`ModelSwitch` 的 `disabled`）对已结算的家族默认全开，但**家族登录后不默认开这一家的任何模型**：登录只写凭据，要用的行得在模型页勾选，路由才进 `settings.yaml`。一次登录把整家目录（Devin 80 行、Command Code 86 行）塞进 DSH 选择器不是「默认好用」，是默认噪音。

- **只对「跑着的时候登录」生效**：插件实例构造时把当时已在册的家族写进 `seenLogins`（`#seedSeenLogins` 读一次 `auth.json`），这些家族保持用户已有的选择——升级不会把老安装的模型关掉。判断标准就是这一个：`auth.json` 里在启动前就有 session 的家族不动，之后才出现的（显式登录、`useKey` 粘贴、导入本机登录、启动时的自动导入）都按登录默认处理。
- **等待勾选期间整家关着**：新登录的家族进 `awaitingPick`，它的当前目录行全部落进 `disabled`；这期间活目录新发现的行也一起关。模型页给这家显示「登录后默认不勾选」（`describeCatalog` 的 `awaitingPick`）。
- **第一次手选就结算**：勾一行 / 家族的「全选」「全关」/ 显式 `selected` 都把这家移出 `awaitingPick`，之后回到普通规则（新发现的行默认开）。
- **不覆盖已有选择**：`seenLogins` 只增不减，登出再登录不会再关一次，用户勾过的行不会被 re-login 抹掉。
- **和「全关恢复」的关系**：`recoverEmptyLoggedInFamilies` 把「已登录且全关」当历史坏状态修掉；`awaitingPick` 的家族是**故意**全关，恢复逻辑显式跳过它们（背景见 [`error.md`](error.md) 2026-09-30 条）。

## 加一个键

新家族在 `models.json` 加键以后（接入顺序见 [`docs/new-family.md`](new-family.md)），同一个 PR 里在 `ADAPTERS` 加一项：给出 `source`，`fetch` 返回按行格式整理好的行（源不给的字段留 `undefined`），有运行时解析器就直接复用；该家的取舍写成 `keep` / `skip` / `newRow`。确实没有端点的，写成 `manual` 并注明出处。
