# AGENTS.md

本文件对 **dsh-plugin-oauth-subs** 的每一次改动都有约束力，对话里的临时说法不能盖过它。
它只做索引：下面链接的文档与本文件同等约束，动手前先读和改动相关的那几份。

## codebase-memory-mcp
本项目已配置 `codebase-memory-mcp` MCP。理解代码库、查找符号、追踪调用链、评估改动影响时，优先主动调用它，而不是只用 grep/逐文件阅读。若未索引，先调用 `index_repository`。

## 文档索引

| 文档 | 管什么 | 什么时候读 |
|---|---|---|
| [`docs/rules.md`](docs/rules.md) | 跨家族硬规则：代码归属、缓存隔离、会话 id、闭集、模型行、别名、隐私 | 每次改动 |
| [`docs/development.md`](docs/development.md) | 技术栈、命令、三种安装来源、热重载、版本号、本地安装测试、活测、发布门禁 | 构建、测试、安装、发版 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 测试与类型检查、会话诊断、模块职责边界 | 写测试、排查慢会话 |
| [`docs/oauth.md`](docs/oauth.md) | 每家的官方 / 社区对照与钉住版本（总表） | 改 hop、升级对照版本 |
| [`docs/new-family.md`](docs/new-family.md) | 新家族接入顺序与理由、对抗审查清单、文件清单 | 加家族 |
| [`docs/new-model.md`](docs/new-model.md) | 新模型接入：`npm run models` 探查、收不收、落地清单 | 加模型、探查上游上新 |
| [`docs/models.md`](docs/models.md) | 模型目录的行格式、来源、`npm run models` 更新流程与合并规则、自定义窗口、费率表 | 改模型、更新目录 |
| `src/oauth/<id>/README.md`、`src/apikey/<id>/README.md` | 该家的设计源：登录、hop、模型出处、额度、缓存、不要做的事、归因（抄什么 / 不要发明什么） | 改该家任何东西 |
| [`docs/error.md`](docs/error.md) | 故障与活测结论 | 修 bug、复现问题 |
| [`design-system/MASTER.md`](design-system/MASTER.md)、[`design-system/pages/settings-workbench.md`](design-system/pages/settings-workbench.md) | 设置工作台的界面规则 | 改 UI |
| [`PRODUCT.md`](PRODUCT.md) | 产品定位与用户 | 做产品取舍 |

## 始终成立

- 只写 TypeScript；`lib/` 由构建生成，不手改，提交前重建（[development](docs/development.md)）。
- 家族专属代码和缓存留在该家目录里，不同家族之间不共用缓存或会话标识（[rules](docs/rules.md)）。
- 模型参数都要有出处，不发明数字（[models](docs/models.md)）。
- 反复出现的故障和活测结论，同一个 PR 记进 `docs/error.md`。
- 一个任务一个 PR；不改版本号、不打 tag、不发布，这些由维护者做。
