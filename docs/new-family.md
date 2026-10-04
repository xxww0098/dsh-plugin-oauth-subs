# 新家族接入

新家族在同一个 PR 里按 0→7 的顺序落地：每一步写明改哪些文件、出口门禁是什么，门禁不过就不进下一步。所有步骤都受 [`docs/rules.md`](rules.md) 约束。**只加模型不加家族走 [`docs/new-model.md`](new-model.md)**。

## 顺序

0. **归因（先于一切代码）** — 钉住一线客户端版本和社区对照仓，在 [`docs/oauth.md`](oauth.md) 总表加一行，在该家 README 的「归因」节写清抄什么、不要发明什么。要回答的问题：登录方式（PKCE / 设备码 / CLI poll）、chat 端点与 wire 协议、缓存亲和字段、模型目录来源、额度端点、UA / 指纹。没有归因不写代码，后面每一步「抄」的东西都出自这里。
1. **登录 / session** — `<id>/index.ts`（端点、flow、session builder、refresh、UA）；`store.ts` 的 `PROVIDER_IDS` / `accountIdOf` / `publicSession`；`login.ts` 的 login / useKey / import 分支和 `controller.ts` 的 cancel / logout / switch，家族专属的自动导入、身份回写、登录收尾放 `<id>/accounts.ts`，照 Codex / Grok / Kimi 的写法；`plan.ts` 把 wire 上的套餐名映射成用户可见的名字。出口：session 往返测试通过，opaque id 不外露。
2. **hop + cache（原子）** — `proxy.ts` 里显式的 `family === '<id>'` 分支，加上 `<id>/cache.ts` 和 `<id>/request.ts`；`src/oauth/families.ts` 注册该家 `applyCache` 行（只引用 `<id>/cache.ts` 的函数，注册表里不抄实现），`proxy-body.ts` 的分派即查表；`passthrough.ts` 加 forward 分支。出口：缓存隔离测试和代理路由测试通过。
3. **额度** — `<id>/quota.ts`（端点与解析，公用工具取 `src/oauth/quota-shared.ts`）+ `src/oauth/families.ts` 注册该家 `fetchQuota` 与额度补全 hook（`afterEnsure` / `remember` / `discover`，取代 `quota.ts` `QuotaStore` 与 `account-quota.ts` 的逐家分派分支，注册表里同样只引用不实现）；snapshot 给每个已存账号都补上额度，不只是活动账号。出口：`snapshot shows quota on every <id> account`。
4. **模型** — 分三段：
   - 目录：`src/catalog/models.json` 加 `<id>` 键，`src/catalog/index.ts` 的 `CATALOG_KEYS` 闭集同步加 `<id>`，`scripts/models.ts` 的 `ADAPTERS` 接上该家目录源（没有端点就写 `manual`），`<id>/index.ts` 导出 `<ID>_MODELS = catalogRows('<id>')`。价格徽标：在 `scripts/rates.ts` 的 `resolvers` 接上该家价目源，`npm run rates -- --write` 写 `src/catalog/rates.json` 的 `<id>` 键（有价目才加；字段与源见 [`docs/models.md`](models.md) 末节）。每个参数的出处写进 README。规则见 [`docs/models.md`](models.md)。
   - 接线：`models.ts` 的 `FAMILY_IDS`、`buildProviders`、`catalogProviders`、`describeCatalog`、`familyOfProvider` 后缀、`HARNESS_MODEL_AGENT`；`src/utils/context-mode.ts` 的 `familyMaxContextWindow` 加 `<id>` 分支，`src/oauth/harness-sync.ts` 的 `cursorModels`/…/`commandCodeModels` 参数袋要加该家；价格经 `catalogPricing()` 自动进 `describeCatalog`，不用单独接线。`displayName` 按 `Subs · <家族名> · <协议>`（协议段 = Chat / Responses / Anthropic，由 `api` 推导，见 [`docs/rules.md`](rules.md)）。有活目录的家族加 `<id>CatalogModels()`，并在 login / import / 额度刷新 / `warmCatalogs` 时重新 sync（Cursor / Devin 是先例）。`baseURL` 对齐该 SDK 真正 post 的路径。
   - 渲染：未登录也在模型页列出（锁定，提示登录后同步）；`sync()` 只把已登录且已勾选的行写进 `settings.yaml`，**新登录的家族默认一行都不勾选**（登录默认，见 [`models.md`](models.md)）。`-fast` 孪生行只在该家有真 Fast 语义时加（Codex Priority / Cursor RequestedModel / Devin 后端变体）。
5. **UI** — `src/ui/parts/`：文案 `copy.ts`、家族表 `usage.ts`、图标 `quota.ts`、账号卡 `provider-card.ts`；`src/ui/client.ts` 的 `quotaPanel` / `FAMILY_NAME` 加该家；`src/index.ts` re-export 公共件。图标规则见 [`design-system/pages/settings-workbench.md`](../design-system/pages/settings-workbench.md) Rail icons。
6. **测试** — `test/<id>.test.ts`：登录解析、session 往返、目录、缓存隔离、代理路由、额度 snapshot。
7. **活测 + 收口** — 真实账号跑一遍，`npm run analyze` 看缓存命中率，结论写进 [`docs/error.md`](error.md)。活测结论落进 error.md 才算完成。

## 为什么先登录，hop 和缓存同一步

- 先做缓存，写出来的是跑不起来的代码：缓存字段（`session-id` / `x-grok-conv-id` / `cascade_id` / 前缀拼接位置）由该家的 wire 协议决定，没有 hop 就没法验证。
- hop 做完再补缓存，会重犯已经犯过的错：`Date.now()` 当会话 id、别家的缓存头串进来、把 DSH `session_id` 原样发上游被 400。缓存是 wire 设计的一部分，不是事后优化。
- 所以顺序是：归因钉住缓存字段 → 登录 → hop 和缓存同一步落地 → 活测验证命中率。

## 对抗审查清单（PR 自答）

- [ ] 在该家的 diff 里 grep：`Date.now()` / `randomUUID()` / `Math.random()` 没有出现在会话或缓存 id 的位置；缺 DSH id 时回退到 `dsh-<id>` 常量。
- [ ] DSH `session_id` 没有原样发上游。
- [ ] `<id>/cache.ts` 没有 import 别家的 cache；`src/utils/` 没有新增缓存改写；对照仓的多家族共用层没有进树。
- [ ] 别家的缓存头没有写进本家的请求。
- [ ] `api` / `reasoningEfforts` 键 / `compat` 没有超出闭集（本地闸门是 `assertDshServiceableProvider`）。
- [ ] `familyOfProvider` 加了 `-<id>` 后缀，否则模型页会把它归到错的家族。
- [ ] `displayName` 是 `Subs · <家族名> · <协议>`（Chat / Responses / Anthropic 对应 `api`），协议段不是厂商品牌。
- [ ] `HARNESS_MODEL_AGENT` 有 `<id>`，并且和 UI 的 `FAMILY_NAME` 同名；漏了的话 settings.yaml 别名会退回裸 provider id。
- [ ] `publicSession` 不暴露 token / refresh / opaque account id。
- [ ] 额度缓存 key 是 `provider\0accountId`，snapshot 覆盖每个已存账号。
- [ ] `catalogProviders` / `buildProviders` 该传的 `<id>Models` 都传了；漏传会导致活目录进不了 picker（已经犯过）。
- [ ] 活测命中率和结论已经写进 `docs/error.md`；单测全绿不等于可以合并。
