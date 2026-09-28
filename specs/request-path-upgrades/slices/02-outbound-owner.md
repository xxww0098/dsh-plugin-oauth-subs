# 02 出站 HTTP 单一所有者（F1 + F9 的一半）

分两个子 slice，各一个 PR。02a 是 P0，越早合入越好；02b 要改 31 个文件，必须在 W2 开始前
**单独**合入，避免和其他 slice 冲突。

## 02a 出站代理不再卡死启动（P0）

**波次** W0。**依赖**：WIP 已提交。

### 解锁的契约

- 无论出站代理配置成什么样，回环代理都会监听，设置页都能打开。
- 无效或无法构建的代理 URL 永远不会被持久化。
- 已配置但不可用的代理会让每个请求明确失败，报 `outbound proxy unavailable: …`，
  **绝不**悄悄改走直连。

### 接缝

- `package.json` 的 `dependencies` 加 `undici@^7`，并更新 `package-lock.json`（这是被跟踪的
  lockfile；未跟踪的 `pnpm-lock.yaml` 不动）。这是本计划唯一一次改包文件。
- `src/utils/outbound.ts`：
  - 静态 `import { fetch, Agent, ProxyAgent } from 'undici'`，它是全仓唯一的 undici 导入方。
  - `makeAgent` 直接 `new ProxyAgent(url)`，删掉 `require('undici')`。
  - `load()` 在 `finally` 里 resolve `ready`；失败保存为 `error`，通过 `snapshot().error` 暴露。
  - `setUrl`：先构建候选 agent，再写 prefs 文件，最后替换当前 agent。任何一步失败都保留
    原状态，文件不动。
  - 新增 `close()` 释放 agent，在 `src/index.ts` 的 `ctx.effect` 清理里调用。
  - 删除死代码 `createOutboundFetch`（只有测试在用）。
- `src/index.ts`：`await outbound.ready` 保留，因为它现在一定会 settle。
- `src/ui/client.ts`：在出站代理区域显示 `snapshot().proxy.error`，遵守
  `design-system/pages/settings-workbench.md`。

### 能跑 / 能看见

- `node specs/request-path-upgrades/assets/repro/outbound-deadlock.mjs` 打印 `ready resolved`，
  不再有 unhandledRejection。
- 用 `HTTPS_PROXY=http://127.0.0.1:9` 启动宿主：`/health` 返回 200，设置页显示代理错误，
  Codex 对话报出明确的代理错误。

### 验证门禁

- `test/outbound.test.ts` 新增 3 个用例：
  - 不注入 `agentFor`，环境里有代理：`ready` 能 resolve。
  - `agentFor` 抛错：`ready` 能 resolve，`snapshot().error` 有值。
  - `setUrl` 构建失败：prefs 文件和先前状态都不变。
- 注入 `agentFor` 的旧用例保留，但不能再是唯一的覆盖。
- **截图检查，放在最后做**：
  1. 分别截改前、改后的设置页出站代理区域（改后要处于有错误的状态）。
  2. 用 compare-screenshots 判断新增的错误行有没有破坏原有布局。本机没有这个 skill 时，把两张图
     并排交给一个全新子代理判断。
  3. 对改后的截图做一次不带预设的 screenshot-critique。本机没有这个 skill 时，让一个全新子代理
     只看图评审。
  4. 评审只看这一个变量：错误行的可读性，以及和 `design-system/pages/settings-workbench.md`
     是否一致。页面其他地方的问题不在本 slice 范围内。

### 活测

- Codex 发 1 次请求：代理设为死端口时报明确错误，清掉代理后恢复正常。

### 下放

错误文案。

## 02b 每一跳都走同一个所有者

**波次** W1（单独合入）。**依赖**：02a。

### 解锁的契约

对话、额度、目录、刷新、登录、Cursor 拨号，所有出站请求都经过 `outbound.ts` 决定走直连
还是代理。

### 接缝

- `outbound.ts` 导出模块级的 `outboundFetch(input, init)`：
  - 用 undici 的 `fetch` 加当前 dispatcher：直连用 `Agent`，代理用 `ProxyAgent`；NO_PROXY 和
    回环地址走直连 `Agent`。
  - 配置加载完成之前也走直连 `Agent`，绝不回落到全局 `fetch`。
  - 调用方没设 UA 时补 `user-agent: node`，保持今天全局 fetch 的默认值。
  - `keepAliveTimeout` 在本 slice 保持 undici 默认值，由 11 来改。
- 另外导出 `outboundProxyFor(url)`，给 Cursor 的 h2 拨号器用。
- `createOutboundSession()` 不再返回 `fetchFn`（02a 留下的过渡接缝，到这里删掉）。
  `src/index.ts` 传给 `AuthController` 和 `createProxy` 的 `fetchFn` 改为 `outboundFetch`，或者
  干脆不传、走默认值。
- 把 `src/` 下 31 个文件里的 94 处 `fetchFn = fetch` 默认值换成 `outboundFetch`，并补上漏接的
  `ollamaDiscover`、`cursorDiscover`（它们今天会绕过代理）。
- 热重载时模块级状态要跟随插件实例：`ctx.effect` 负责配置和 `close()`。
- `src/oauth/cursor/upstream-proxy.ts`：
  - 代理优先级：`cursorProxy` 配置 → `PI_CURSOR_PROXY`/`CURSOR_PROXY` → `outboundProxyFor(url)`，
    并遵守 NO_PROXY。
  - 直连的 `http2.connect` 加 10s 连接超时。

### 能跑 / 能看见

防火墙测试的失败信息会直接列出违规的文件和行。

### 验证门禁

- 新增源码扫描防火墙测试。除 `src/utils/outbound.ts` 外，`src/` 里不许出现：
  - `from 'undici'`
  - `= fetch` 默认值
  - 裸调全局 `fetch(`
  - `setGlobalDispatcher`
- `test/cursor-transport.test.ts`：
  - 回落到出站代理 URL。
  - 连一个黑洞地址，在超时时间内被拒绝。
- 各家族测试照常注入 `fetchFn`，全部保持绿色。

### 活测

- Cursor `GetUsableModels` 1 次、Codex `GET /models` 1 次，都走 `outboundFetch`。

### 下放

替换默认值的机械手法：批量替换也行，逐文件改也行。

## 必须保持绿色（02a、02b 共同）

`npm test`、`package-surface`、所有家族测试，以及 Antigravity 的 UA 断言
（`test/antigravity.test.ts:200`）。

## 会改变本 slice 的反馈

- undici 7 在宿主 Node 24 上出问题（导入失败、dispatcher 不兼容）：02b 暂停，把证据发给用户。
  02a 的 fail-soft 不受影响，照常合入。
- 用户不同意改包：02a 退化成「`ready` 必然 settle + 缺依赖时显示错误」，02b 和 11 移出本计划。
