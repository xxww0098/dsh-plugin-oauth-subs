# 14 设置页轮询与额度 TTL（F11，决定 8）

**波次** W2。**依赖**：02b。**PR**：1 个。必须先于 07 合入，因为两者都改 `controller.ts`。

## 解锁的契约

插件面板真正可见时才轮询；打开过又切走的面板（主面板会一直挂载着）不再在后台每 1.5s
拉一次。被动的额度数据 60s 才过期；手动「刷新额度」照样强制刷新。同时发起的多个
`snapshot()` 合并成一次。

基线：本机 13 个账号，每分钟约 78 次额度请求。改完后预期每分钟最多约 13 次，面板隐藏时为 0。

## 接缝

- **`src/ui/client.ts`**（L3306-3311 的 effect）：
  - 新增纯函数 `panelVisible(el, doc)`，返回 `!doc.hidden && el.checkVisibility?.() !== false`。
  - 只在可见时轮询；上一次轮询完成后才安排下一次，避免重叠。
  - 面板重新可见时立刻刷新一次。
  - 如果 DevTools 里确认 `checkVisibility()` 对保留的主面板无效，改用 IntersectionObserver 加
    `visibilitychange`。
- **`AuthController.snapshot()`**（`controller.ts:605-673`）：同一时刻只跑一次，共享进行中的
  promise，settle 后清掉。
- **`QUOTA_TTL_MS`**（`quota.ts:90`）改为 `60_000`。`refreshQuota` 绕过 TTL，但如果已有同一账号
  的刷新在进行，就等它（复用 `QuotaStore` 现有的按账号去重）。
- **身份发现节流**：GLM 和 Cursor 的身份解析，每个账号最多 60s 一次，登录状态变化时清掉节流。
- **GLM `getJson` / `postJson`**（`glm/index.ts` 约 L633-645）：加 `AbortSignal.timeout(10_000)`，
  防止一个挂住的请求卡死合并后的 snapshot。
- **Cursor 的 `state.vscdb`**（`controller.ts` 约 L1175）：只在某个 Cursor 账号行缺可读身份时
  才打开。

## 能跑 / 能看见

打开插件面板再切到别的面板，设置页发出的 snapshot RPC 应该归零。可以用 DevTools 观察，
也可以在 controller 里临时打点计数，但打点代码不进提交。切回来立刻刷新一次。

## 验证门禁

- `test/controller.test.ts`：
  - 两个并发 `snapshot()` 对每个账号只打一次额度接口；
  - TTL 内再调用，不发请求；
  - `refreshQuota` 只打一次；
  - 失败之后下一次还能恢复；
  - 每个已存账号都有额度数据（「snapshot shows quota on every <id> account」这类用例保持绿色）。
- `test/ui-client.test.ts`：改写 L41 的正则，另加 `panelVisible` 的单元测试。
- `test/quota.test.ts`：TTL 边界。

## 活测

无需额外请求。打开面板时观察一次真实的轮询次数即可。

## 下放给实施者的决定

合并 promise 的存放位置、节流表的数据结构。

## 必须保持绿色

`npm test`，设置页的其余 UI 测试。

## 会改变本 slice 的反馈

如果宿主会卸载隐藏的面板（不是保留挂载），可见性判断就是多余的：删掉它，只保留 TTL 和
合并两项改动。
