# 实施中的自主决定（choices 账本）

spec 没写到、由实施者自己拍板的决定。每条：决定 → 理由 → 结论（sound / provisional / user）。
最终收尾时按最终代码重写本文件。

## 编排

- **在 `rpu/integration` 集成分支上实施，不碰 `main`。** 维护者的 WIP（约 60 个文件，含 Command
  Code、donate、Anthropic 导入只读修复）仍未提交且在持续改动；用户选择「自己提交」后又指示
  继续。所以各 slice 从 HEAD（48b78b8）+ spec 提交分支，合进 `rpu/integration`，由维护者在
  WIP 落地后 rebase/合并。→ provisional（user）：WIP 与 `controller.ts`、`proxy.ts`、
  `client.ts`、`models.ts`、`quota.ts` 必有冲突，需维护者合并时处理。
- **依赖 WIP 的部分暂缓**：05d（Command Code 源码只在 WIP 里）、08 的 Command Code 部分、07 的
  Anthropic 迁移（`#refreshAnthropic` 只在 WIP 里）。→ provisional，WIP 落地后补。

## 02a

- **错误行放在主栏 `.osubs-pane` 顶部**（与现有 RPC 错误提示同款 `.osubs-hint.osubs-bad`），
  因为 `client.ts` 没有「出站代理区域」，只有 `proxyGet`/`proxySet` RPC。→ sound。
- **死端口也进 `snapshot().error`**：代理 URL 能构建、但连不上时，记录最近一次代理路径失败，
  下次成功或 `setUrl` 清掉；否则 spec 要求的 `HTTPS_PROXY=http://127.0.0.1:9` 在设置页看不到。
  → sound。
- **代理路径上除中止外的失败都包成 `outbound proxy unavailable: <detail> via <脱敏代理>`**；
  中止原样抛出，保留代理的中止处理。→ sound。
- **`close()` 后如仍配置了代理，`error = 'closed'`**：迟到的请求失败而不是直连。→ sound。
- **`setUrl` 的构建错误原样抛给调用方**，不包装。→ sound。
