/**
 * Limited-time ZCode Coding Plan boost copy. Official line:
 * 「GLM Coding Plan 用户在 ZCode 中登录使用即可享受全天 1.5 倍使用额度」
 * (same calls billed at 67%). Visible on the GLM account card only.
 */
export const GLM_BOOST_LABEL = Object.freeze({
    zh: '150%配额',
    en: '150% quota',
});
export const GLM_BOOST_HINT = Object.freeze({
    zh: 'ZCode 登录使用享 150%配额',
    en: 'ZCode session: 150% quota',
});
export function glmCardBoost(family, locale = 'zh') {
    if (family !== 'glm')
        return undefined;
    const loc = locale === 'en' ? 'en' : 'zh';
    return {
        label: GLM_BOOST_LABEL[loc],
        hint: GLM_BOOST_HINT[loc],
    };
}
