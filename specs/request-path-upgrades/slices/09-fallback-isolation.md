# 09 回退 id 不再跨会话 pin，GLM 改用常量（F6 回退部分 + F8）

**波次** W3。**依赖**：08（改的是同一批 `cache.ts`）。**PR**：1 个。

## 解锁的契约

即使请求没带会话 id、走的是家族回退常量，也绝不会把一个会话的系统提示、工具列表或 thinking
配置带进另一个会话。每个家族的会话 id 只推导一次，由它自己的 `cache.ts` 完成。GLM 的
`x-session-id` 在重启和热重载之后保持不变。

## 接缝

- **一个解析器 + 一个谓词。** 每个家族的 `cache.ts` 各有一个 `<fam>ConversationId(payload)`
  解析器，以及一个 `is<Fam>Fallback(id)` 谓词。谓词判断 id 是否为基础常量本身，或以
  `<常量>:` 开头。适用家族：kimi、copilot、kiro、cursor、antigravity、devin。Devin 的回退从
  `devin/transport.ts` 挪进 `devin/cache.ts`。
- **修掉失效的守卫。** 今天有几个守卫永远不会命中，因为回退 id 带了模型后缀：
  `kiro/cache.ts:51`（对照 L70-76）、`antigravity/cache.ts:37-39`（对照 L148-154）、
  `cursor/cache.ts` 约 L84。kimi（`cache.ts:53-86`）和 copilot 干脆没有守卫。
  以上所有 pin（系统提示、Antigravity 的 tools 和 thinking）都改为以谓词为门：**回退 id 一律
  不 pin。**
- **Antigravity 的 thinking pin。** 同一个真实会话内仍然「先到先得」；但用户显式改了推理
  强度时，新值要替换 pin。
- **传输层不再二次推导 id。** 以下几处改为直接使用传进来的 `cacheSessionId`：
  `kiro/transport.ts:82-84`、`antigravity/transport.ts:33`、`cursor/transport.ts:37`、Devin 的
  回退逻辑。
- **GLM 用常量。** `glm/cache.ts` 导出 `GLM_STABLE_SESSION = 'dsh-glm'`，取代
  `glm/index.ts:323` 的随机值 `GLM_PROCESS_SESSION_ID`；L396 改用它。
- **防火墙测试。** 扫描 `src/oauth/*/cache.ts`、`src/apikey/*/cache.ts` 和各家族构建请求头的
  函数：会话 id 的位置上不许出现 `Date.now`、`Math.random`、`randomUUID`、`randomBytes`。

## 能跑 / 能看见

在一个进程里连续发两个没带 id、系统提示不同的会话，每个会话收到的都是自己的系统提示。

## 验证门禁

- `test/cache-families.test.ts`，按家族逐一测「两个没带 id 的会话各自保留系统提示」。
  `cache-families.test.ts:15` 的「每个家族各有自己的 cache helper」保持成立。
- `test/glm.test.ts`：改写 L617、L652。新断言是 `x-session-id === 'dsh-glm'`，且模块重载后
  仍然相同。
- `test/antigravity.test.ts`：同一真实会话内改推理强度后，新值生效。
- 防火墙测试全绿。

## 活测

GLM 发 1 次请求，确认 Z.ai 接受 `x-session-id: dsh-glm`。

## 下放给实施者的决定

解析器和谓词的命名（遵循 `<fam>` 前缀）。

## 必须保持绿色

`npm test`，各家族缓存测试（前缀稳定性、system parking）。

## 会改变本 slice 的反馈

无预期。如果 GLM 拒绝常量会话头，改为按「模型 + 首条用户消息」做稳定哈希。仍然不许用
随机数或时间戳，并把这次改动记下来。
