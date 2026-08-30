/**
 * Pretty-print ChatGPT / Codex plan_type and Grok subscription_tier for the
 * Settings card. Raw slugs stay on the wire (`plus`, numeric JWT tier);
 * the UI shows Plus / SuperGrok / X Premium+.
 */
export declare const CODEX_PLAN_NAMES: Readonly<{
    free: "Free";
    free_plan: "Free";
    free_trial: "Free";
    go: "Go";
    chatgpt_go: "Go";
    plus: "Plus";
    chatgpt_plus: "Plus";
    pro: "Pro";
    chatgpt_pro: "Pro";
    team: "Team";
    chatgpt_team: "Team";
    business: "Business";
    enterprise: "Enterprise";
    edu: "Edu";
    education: "Edu";
    student: "Student";
}>;
export declare function formatPlanLabel(raw: any): any;
export declare function pickPlanRaw(...values: any[]): string | number;
