# 15 收尾复测

**波次** W6。**依赖**：其余 slice 全部合入，并在合入后正常使用 ≥7 天。**PR**：1 个
（只含报告、文档和必要的阈值调整）。

## 解锁的契约

用同一把尺子证明改进确实发生了。没达标的项，要么按预设规则调整，要么另开 slice，不在这里
临时发挥。

## 接缝

```
npm run analyze -- --dir ~/.dsh/sessions --since <最后一个合入日> --compare specs/request-path-upgrades/assets/baseline-30d.json --json
```

结果写入 `assets/after-<日期>.json` 和 `.txt`。

## 目标（窗口较短，计数按每 1k 次调用归一）

| 指标 | 目标 | 基线 | 负责 slice |
|---|---|---|---|
| oauth-* 路由的 `idleTimeout300` | 0 | 35（30 天） | 04、05 |
| `proxy504` 之后宿主重试成功的比例 | ≥80% | — | 04、05 |
| Cline 的 `INFERENCE_CAP` 被当作 RATE_LIMIT 重试的次数 | 0 | 5 | 04 |
| Antigravity `hitByCallIndex` 120–199 桶 | ≥85% | 49.9% / 40.9% | 08–10 |
| 各 Completions 家族的 `weightedCacheHit` | ≥ 基线 − 3 个百分点 | 见基线 | 08 |
| codex / grok 的 `coldPenaltyMs` | 下降 | 由 01 测出 | 11 |
| ECONNRESET 与 socket 类重试 | 不高于基线 | 见基线 | 11、04 |
| codex 的 ttfb p50 | 不高于基线 | 由 01 测出 | 13 |

## 预设规则（到这里直接执行，不用再问）

- **Devin 首字节**：如果 Devin 的 `proxy504` 超过 Devin 调用数的 0.5%，并且对应请求在基线里是
  能成功的，就通过 05c 预留的覆盖入口，把 Devin 的首字节窗口放宽到整个预算（270s，相当于
  只尝试一次）。
- **按会话 id 拉低了命中率**：按 08 的回退规则处理，只回退上游亲和字段。
- **ECONNRESET 上升**：按 11 的规则把保活降到 30s。
- **Antigravity 未达 85%**：按 10 的反馈另开 slice 调查。

## 验证门禁

报告文件已写入；`docs/error.md` 写一条总结（≤12 行）；README 的全局 TODO 全部勾选。

## 下放给实施者的决定

报告的表述方式。

## 收尾

按 implement-spec 的流程，用最终代码重写 `choices.md`，再用 close-spec 把本目录归档到
`specs/done/`。本机如果没有 close-spec，就把 README 改写成理由记录：留下结论和决定，删掉
施工梯子。
