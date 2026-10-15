# Arena Agent 数据源核查

核查日期：2026-10-14、2026-10-15。范围：官方数据卡、仓库文件与提交历史，以及本机独立 Node/Chrome 活测。

**结论：官方 Hugging Face 数据可补充 Overall 分数与信号，但尚未验证完整榜单替代源。** 2026-10-15 复查的 `agent/latest` 已更新到 **2026-10-14、54 个模型**，但仍仅含 Overall 与原有 11 列；不能把较新发布日期当作完整字段或与网页同一批次的证明。

## 插件独立浏览器活测

正式模块 `src/utils/arena-browser.ts` 使用 Node 标准库与本机 Chrome，复用插件的 `parseArenaBoard`，无需 DSH 浏览器 API 或新增插件依赖。执行 `npm run build` 后运行 `node --experimental-strip-types scripts/arena-browser-probe.ts`，打开终端输出的 loopback 地址并进入榜单；答案被挑战挡住、来自归档，或没有缓存且加载失败时才会出现「浏览器验证」；测试页加载实际编译 UI、RPC dispatcher、采集器及缓存模块，初次下载测试用 React UMD 到 `.local/`。采集器使用临时独立 profile 与私有 CDP pipe，先打开 Overall 验证页；就绪后在该浏览器上下文并发请求四类 RSC，由 Node 复用 `parseArenaBoard`。仅在 `403 cf-mitigated: challenge` 时，对受影响分类必要导航，再按主 frame、文档 loader 与 requestId 通过 `Network.getResponseBody` 一次读取当前导航响应并提取 inline RSC；不再轮询整份 HTML 或从渲染后的 DOM 提取榜单。fetch 限定 same-origin credentials/mode 并拒绝重定向，逐个检查 HTTP 状态、挑战标记、`text/x-component`、`snapshot` 与 `costStats`；普通失败或导航兼容失败使整批失败，单请求 20 秒、批量 CDP 25 秒、整个任务三分钟上限。结束后关闭自己的进程并清理 profile；遇到交互验证需由用户在 Chrome 内完成，程序不会操作验证码。

2026-10-14 旧版 HTML/inline RSC 采集实测 Chrome `155.0.8059.40`：Node RSC 请求仍是 `403 cf-mitigated: challenge`；同机新启动的独立 Chrome 无需点击验证码即可返回四类快照，日期均为 **2026-10-13T22:00:00.000Z**。断言验证非空榜单、会话数、成本/输出 Token 的 P25/P50/P95、价格、五项信号及其 CI 能被现有解析器读取。

| 分类 | 模型行数 | 会话数 | 成本非空行 | Token 非空行 |
| --- | ---: | ---: | ---: | ---: |
| Overall | 53 | 2,555,192 | 49 | 52 |
| Code | 53 | 823,005 | 49 | 52 |
| Chat | 52 | 870,694 | 48 | 51 |
| Work | 53 | 1,467,862 | 49 | 52 |

正式插件已接入该流程：`arena` RPC 的 `browser: start/status/cancel` 控制一个有界任务，UI 轮询成功答案后更新显示及 localStorage，Node 原子更新 `arena-cache.json`。缺少分类、更旧快照、取消、超时、Chrome 关闭或写缓存失败时不宣称成功；普通 iframe 内直接展示验证页仍会被实测响应头 `X-Frame-Options: SAMEORIGIN` 拦截，插件页面的跨域 `fetch` 也受跨域策略限制；Chrome 验证页内的同源 RSC 请求不依赖跨域放行。2026-10-14 旧版正式 UI 活测从 1 行旧测试缓存自动更新到四类实时榜单，`/proof` 断言落盘与返回值相同、重建读取器也能读到新缓存；macOS Chrome 已活测，Windows/Linux 路径有单测，其他系统及手动验证码尚未活测。

2026-10-15 运输路径复查：已有浏览器会话的四类同源 RSC 都返回 `200 text/x-component`，但插件全新临时 profile 的 RSC 与 HTML fetch 均返回 `403 cf-mitigated: challenge`，有界延迟重试也未恢复；同一窗口的 Overall 正常导航 HTML 则包含 `snapshot` 与 `costStats`。因此 RSC 并发只能作为快路，不能删掉导航能力；导航必须等新文档 loader 提交，并等待同源同路径的 `__cf_chl_*` 临时 URL 恢复干净地址；跨站或错误路径仍拒绝。响应必须绑定当前 frame/loader/requestId 与最终精确 URL，且为 HTTP 200 HTML；本次 `Page.getResourceContent` 曾取回挑战 HTML，但仅凭 URL、标题或 `readyState` 不能认定导航已经成功；必须等待当前文档的成功响应，不能把 403 挑战体当榜单解析。导航兼容只读取原始响应，不回到 DOM/整页 HTML 轮询，也不因一次成功承诺 Cloudflare 始终放行。

**2026-10-15 优化版活测限制**：实际编译采集器在 Overall 取得可解析的原始导航载荷，Code 导航触发 Cloudflare 403 / Turnstile；未完成人工验证，三分钟上限后超时退出。测试旧缓存的四类 1 行旧快照均保持不变，未遗留插件启动的 Chrome 进程；本轮没有验证四类新快照成功提交或重新打开读取，不能借用旧版活测或既有浏览器会话的成功作证明。并发 RSC、受挑战分类导航、当前文档请求绑定、临时挑战 URL、200 响应就绪、缺字段、取消与超时清理均有公开接口回归；本轮全量 1261 项测试及类型检查通过。

Chrome 136 起调试参数必须配合非默认 profile，见 [Chrome 官方说明](https://developer.chrome.com/blog/remote-debugging-port)。[Cloudflare 官方浏览器支持说明](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/) 不保证自动化/修改过的浏览器可以通过挑战；历史成功不能保证之后每次都无需人工验证。

## 官方数据与 JSON 入口

- 数据集：[lmarena-ai/leaderboard-dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset)。[原始 README](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/raw/main/README.md) 的 YAML 配置与 schema 比正文信号列表更完整；`latest` 表示该子集最近一次发布，`full` 表示历史发布记录。
- JSON：[splits](https://datasets-server.huggingface.co/splits?dataset=lmarena-ai%2Fleaderboard-dataset)；[Overall rows](https://datasets-server.huggingface.co/rows?dataset=lmarena-ai%2Fleaderboard-dataset&config=agent&split=latest&offset=0&length=100)。读取信号时替换 `config`。

| 内容 / 当前名称 | config |
| --- | --- |
| Net Improvement（总分） | `agent` |
| Confirmed Success | `agent_task_outcome_explicit` |
| Praise vs Complaint | `agent_praise_complaint` |
| Steerability | `agent_steerability` |
| Bash Reliability | `agent_bash_reliability_no_prereq` |
| Tool Hallucination（定义页写作 Tool Hallucinations） | `agent_tool_hallucination` |
| 旧 Bash Recovery | `agent_bash_recovery_steps` |

配置依据：[README YAML](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/raw/main/README.md)。名称依据：[官方信号定义（更新于 2026-10-12）](https://arena.ai/resources/agent-arena-signals)。[官方变更日志](https://arena.ai/company/leaderboard-changelog) 明确记录 10 月 12 日 Bash Recovery 改为 Bash Reliability，同时改变错误检测和计分方法，不能只当作名称别名；数据卡正文仍列旧 config。

## 已检查的 schema 与实测

`agent/latest` 恰有 11 列：`model_name`、`organization`、`license`、`score`、`score_ci_lower`、`score_ci_upper`、`observation_count`、`session_count`、`rank`、`category`、`leaderboard_publish_date`。`score` 是 IPS 分数，两个 CI 列是分数的 95% 置信边界。数据卡正文把计数写为整数，但 YAML 中部分计数为 `float64`，部分信号的 `session_count` 类型为 `null`，不能假定所有子集计数类型及非空性一致。[官方 schema](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/raw/main/README.md)

2026-10-14 实测：匿名 Node 请求 `/splits`、`agent/latest` 及五个当前信号 `/rows` 均最终返回 HTTP 200；每个当前子集 52/52 行，`category` 只有 `overall`，`leaderboard_publish_date` 均为 **2026-10-12**。五个信号的 `session_count` 全为 `null`；旧 `agent_bash_recovery_steps` 日期仍是 **2026-10-08**，不能补作当前 Reliability。Tool Hallucination 首次返回 HTML，定向重试才得到 `200 application/json`，读取时需要检查状态和内容类型，不能承诺始终稳定。

2026-10-15 浏览器复查：[Overall rows](https://datasets-server.huggingface.co/rows?dataset=lmarena-ai%2Fleaderboard-dataset&config=agent&split=latest&offset=0&length=100) 返回 HTTP 200、54/54 行，发布日期为 **2026-10-14**，`category` 仍仅 `overall`，11 列 schema 未变。本次未重新核验五个信号的发布日期及空值情况，不能推断其与 Overall 同步。

| 所需字段 | 已检查的 HF 数据是否提供 |
| --- | --- |
| 总分、五个信号及各自分数 CI | 分散在总分与五个当前 config 中 |
| sessions / observations | 总分有计数；信号 sessions 为 null，保留各信号 observations |
| Agent Code / Chat / Work 子榜 | 当前读取结果没有；仅 Overall。`webdev` / `text` 属于其他 Arena，不是这些 Agent 子榜 |
| Cost/Task、Output Tokens/Task 的 P25/P50/P95 | schema 没有这些列 |
| 输入/输出单价、模型 URL | schema 没有这些列 |
| 名次区间 / `rankSpread` | 只有单值 `rank`；分数 CI 不能冒充名次区间 |

字段判断依据：[数据卡与 YAML](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/raw/main/README.md)；类别限定是本次 `latest` 实测结论，不推断未检查的历史行。

## 官方补充来源与限制

[官方 Agent 页面](https://arena.ai/leaderboard/agent) 展示分类入口、成本/token 的 P50、单价、模型外链及名次区间；尚未验证可稳定获取全部字段的独立替代 JSON；Chrome 同源 RSC 取数及分位字段验证见上文。主线程对正式站 Node、浏览器 UA、RSC 请求均收到 `403 cf-mitigated: challenge`；搜索工具可读页面不等于插件运行环境可读。[官方 arena-catalog 仓库](https://github.com/lmarena/arena-catalog) 是另一处价格与模型链接资料，但所查文件目录没有 Agent 导出，尚不能作为当前 Agent 完整替代源。[仓库说明](https://github.com/lmarena/arena-catalog/blob/main/README.md)

[提交历史](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/commits/main) 显示 Agent 发布日期近期为 9/30、10/02、10/08、10/12，各子集分提交更新；10/12 数据于 10/13 上传。数据卡未承诺固定周期或与网页同日同步。合并时须按模型、类别和发布日期核对总分及信号，不能混入旧 Bash Recovery 或旧成本/token；各榜保留自身来源日期，缺失字段保持未知。本文只记录已核实范围，不宣称所有官方渠道均无替代源。
