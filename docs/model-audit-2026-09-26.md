# 模型目录审查（2026-09-26）

范围：12 个在设置页列模型的家族；核对可调用 ID、协议、窗口、输出上限、输入类型和思考档位。表中“活目录”是该账号或公开端点在当天的结果，不代表所有地区或套餐。

| 家族 | 核对来源与结果 | 处理 |
|---|---|---|
| Codex | ChatGPT 账号 `GET /backend-api/codex/models?client_version=0.155.1`：7 个可见基础 ID，与 `CODEX_MODELS` 一致；另 2 个 hidden 内部行。 | 保留 7 个基础行及 20 个 picker 变体。 |
| Grok | 该账号 `GET https://cli-chat-proxy.grok.com/v1/models`：4 行，恰为 4.7、4.7 Build Fast、4.6、4.5；[官方推理档](https://docs.x.ai/developers/model-capabilities/text/reasoning)仍匹配。 | 不变。 |
| GLM | [Coding Plan 官方表](https://docs.z.ai/devpack/overview)：实际服务 5.3 / 5.3 Flash，旧 ID 自动改道；第三行 Turbo 为 ZCode 启用的既有目录规则。 | 不添加未在套餐内的 FlashX。 |
| Kiro | [官方模型表](https://kiro.dev/docs/models/)更新于 9 月 25 日；本账号 `ListAvailableModels` 9 行，现有 20 行离线目录经活目录合并。Fable 5.1 是仅 Enterprise 可开通的预览。 | Fable 5.1 交给账号活目录；不放入通用离线目录。 |
| Antigravity | [CLIProxyAPI `models.json`](https://github.com/router-for-me/CLIProxyAPI/blob/main/internal/registry/models/models.json) `antigravity` 仍为 12 行，与静态目录一致。 | 不变。 |
| Cursor | 本账号 `GetUsableModels` + `AvailableModels` 生成 60 行；[官方模型页](https://cursor.com/docs/models-and-pricing)的主推模型仍由 15 行离线目录覆盖。 | 校正非 Max Mode Grok 4.7 窗口、Composer 输入、9 家族的参数 ID/思考档；活目录归并时排除 Max Mode 专属窗口，不把 60 行写死。 |
| Ollama Cloud | [官方文档](https://docs.ollama.com/cloud)指定公开 `/api/tags` 为云端 ID 来源；接口现有 17 行。 | 离线目录 20 → 17，删除接口已消失的 3 行。 |
| Kimi | [官方模型表](https://www.kimi.com/code/docs/en/kimi-code/models.html)仍为 4 个 ID；本机无 Kimi 凭据。 | 不变；登录后活目录覆盖套餐窗口。 |
| Copilot | [GitHub 支持模型表](https://docs.github.com/en/copilot/reference/ai-models/supported-models)的可选 GA 行与 32 行离线目录一致；本机无 Copilot 凭据。 | 不变；登录后 `/models` 按账号覆盖。 |
| Devin | 本账号 `GetCliModelConfigs` 返回 598 条，收成 81 个 picker 行，与静态快照的 ID 一致。 | 不变；活目录仍覆盖快照。 |
| Cline | 公开 [`recommended-models`](https://api.cline.bot/api/v1/ai/cline/recommended-models)现为推荐 4 + 免费 6。 | 离线目录 9 → 10：加入 Pixel Canary、Space Bunny Alpha、Gemini 3.8 Flash；删 Solar Pro 4、Laguna S 2.1。 |
| OpenCode Go | 该 key `GET /zen/go/v1/models` 返回 35 行；新增 GPT-6 Luna 与 Space Bunny Free 在各自协议均实测 200，思考档也成功；参数对照 [models.dev `opencode-go`](https://models.dev/api.json)。 | 可服务目录 32 → 34；旧 `deepseek-flash` 同义 ID 仍去重。 |

未做本机对话活测的家族：Kimi、Copilot。无凭据时只使用官方目录和已有离线回退；不会把未经订阅后端确认的 ID 加入目录。OpenCode Go 的模型写入 DSH 还依赖[同步修复 PR #162](https://github.com/xxww0098/dsh-plugin-oauth-subs/pull/162)。
