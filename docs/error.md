# 错误记录

## 2026-08-26：本地 DSH Codex 缓存命中率异常偏低

### 现象

- 环境：本地 DSH 安装的 `dsh-plugin-oauth-subs`，模型为 `gpt-5.6-luna-fast`。
- 证据：`dsh-session-session-d92203fe-406c-489f-b677-8a64f4d16c9f.zip`。
- 90 次模型调用中有 47 次缓存读取为 0。
- 总未缓存输入为 5,689,541 tokens，缓存读取为 2,145,792 tokens，加权缓存命中率约 27.4%。
- 主会话命中率约 28.6%，两个子代理分别约 33.7% 和 17.4%。

### 根因

DSH 的通用 Responses 适配器会发送稳定的 `prompt_cache_key`、`session_id` 和
`x-client-request-id`。插件保留了请求体中的 `prompt_cache_key`，但转发到 Codex
订阅后端时只重新构造 OAuth 与内容类型请求头，丢失了两个会话亲和请求头，导致相同
会话不能稳定路由到同一缓存分片。

上下文压缩不是主因：本次主会话的压缩只集中发生在第 36 步前，而低命中贯穿整个会话。
`prompt_cache_options` 也不是本次主因：默认 short-cache 请求没有发送该字段。

### 修复

`lib/proxy.js` 从格式合法且不超过 64 字符的 Codex `prompt_cache_key` 派生并发送：

```text
session-id: <prompt_cache_key>
x-client-request-id: <prompt_cache_key>
```

不接受请求头直接覆盖该值，Grok 和没有缓存键的请求保持原行为。

### 验证

- 修复前的本地重放：请求体保留缓存键，但两个上游亲和头均为空。
- 修复后的聚焦回归测试：通过，确认两个上游请求头都等于缓存键。
- `node --check lib/proxy.js`：通过。
- `git diff --check`：通过。
- 完整测试当时为 89/90 通过；唯一失败是并行安全加固新增的“token 加载期间客户端断连”测试，与缓存亲和修复无关。

### 待完成的运行时验收

源代码修复尚不能证明本地已安装副本生效。更新本地 DSH profile 中安装的插件并重启宿主后，
应使用同一长会话复测，确认连续调用不再频繁出现 0 缓存，并记录新的加权命中率。
