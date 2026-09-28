# 07 导入登录只读（F4d，决定 4）

**波次** W4。**依赖**：06（刷新语义）、04（「导入已过期」映射为 403）、14（两者都改
`controller.ts`）。**PR**：1 个。

## 解锁的契约

从厂商客户端导入的登录，插件**永远不拿共享的 refresh token 去换票**。临期时重读源文件；
源也过期了，就明确告诉用户去运行那个 CLI，或者改用浏览器登录。这样插件和 CLI 不会再
互相把对方登出。

## 接缝

- **`TokenManager` 新增选项 `imported: { is(session), reread(session) }`**，每个家族注入自己的一份。
  - 对导入的会话，`#refresh` 和 `refreshNow` 只调用 `reread`。
  - 重读结果满足「过期时间 > 当前时间 + 15s」才采用（和 Claude 现在的规则一致），经版本守卫
    写入。
  - 否则抛 `ImportedLoginStale`：它继承 04 的 `LoginRequiredError`（`status: 403`），不算永久
    失败，不删登录，06 的负缓存对它同样生效。
  - 文案：`<家族> imported login is stale; run <CLI> or use browser login`。
- **家族清单**。每家的读取器留在自己的目录里：

  | 家族 | 做法 |
  |---|---|
  | Anthropic | 把 `controller.ts` 里 `#refreshAnthropic` 的导入分支挪到钩子上，行为不变；controller 从此不再持有任何按家族区分的刷新策略 |
  | Codex | `importFrom('codex')` 写入 `source: path`，来自 `import-auth.ts:277-298` 的返回值。硬切：本机存量登录没有 `source`，需要用户手动重新导入 |
  | Cursor `cli_keychain`、`ide_vscdb` | 同时删掉导入时那一次 `tryRefresh` 换票（`cursor/import.ts` 约 L154-161 与 L199） |
  | Cline `cli` | 按上面的钩子处理 |
  | Kimi `cli` | 按上面的钩子处理 |

  **排除**：Devin `cli_toml`（`refreshDevin` 只探测状态，根本不换票），Copilot `cli`（用不会
  轮换的 GitHub token 来铸造令牌）。
- **轮换证据**，逐家写进家族 README：
  - 来源一：厂商客户端的源码（refresh 响应里是否带新的 refresh token）。
  - 来源二：被动观察。对插件自己持有的登录（PKCE / device flow），在宿主自然刷新前后各记一次
    存储里 refresh token 的 sha256 前 8 位。
  - **绝不**在活测进程里兑换导入的 token，也不在活测进程里做任何刷新。
  - 证据显示不轮换的家族，照样按只读处理：决定 4 的默认值不变，只是在 README 里注明可以放开。

## 能跑 / 能看见

表驱动测试的输出；导入会话临期时，日志里出现的是「重读」而不是「换票」。

## 验证门禁

- `test/token-lifecycle.test.ts`，或新建 `test/imported-logins.test.ts`。按家族逐一验证：
  - 导入会话临期 → 调用 `reread`，**从不**调用 `refresh`；
  - 源文件也过期 → 抛 `ImportedLoginStale`，没有调用 `deleteSession`。
- Anthropic 迁移后，原有的「读同一份 store、从不换票也不写」用例全绿。
- `test/import-auth.test.ts`：Codex 导入后带有 `source`。
- Cursor 导入不再发出任何换票请求（用 fetch 桩断言）。

## 活测

只读：每家族对导入的源重读 1 次，确认能解析，不发任何网络请求。

## 下放给实施者的决定

stale 文案里 CLI 的具体叫法；钩子挂在 `TokenManager` 构造参数上还是由各家族 manager 工厂
注入。

## 必须保持绿色

`npm test`，Anthropic 的导入与刷新测试。

## 会改变本 slice 的反馈

stale 报错明显增多（用户不常运行对应的 CLI）是决定 4 预期内的代价，把证据发给用户
（非阻塞）。用户要放开的话，只对「源码证据显示不轮换」的家族放开。
