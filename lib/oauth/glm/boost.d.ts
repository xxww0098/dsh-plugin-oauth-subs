/**
 * Limited-time ZCode Coding Plan boost copy. Official line:
 * 「GLM Coding Plan 用户在 ZCode 中登录使用即可享受全天 1.5 倍使用额度」
 * (same calls billed at 67%). Visible on the GLM account card only.
 *
 * The source-backed half is the path: ZCode sends every Coding Plan
 * Anthropic call through the zcode.z.ai gateway (official-coding-plan-
 * gateway.ts + NOTICE.md 「官方 Coding Plan 模型网关转发」), which runs the
 * plan-entitlement check. Whether the gateway also applies the 1.5x is
 * server-side and unverified here — the copy names ZCode, not a protocol.
 */
export declare const GLM_BOOST_LABEL: Readonly<{
    zh: "150%配额";
    en: "150% quota";
}>;
export declare const GLM_BOOST_HINT: Readonly<{
    zh: "ZCode 登录使用享 150%配额";
    en: "ZCode session: 150% quota";
}>;
export declare function glmCardBoost(family: any, locale?: string): {
    label: "150%配额" | "150% quota";
    hint: "ZCode 登录使用享 150%配额" | "ZCode session: 150% quota";
} | undefined;
