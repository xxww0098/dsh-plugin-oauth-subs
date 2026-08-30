/**
 * Pretty-print ChatGPT / Codex plan_type and Grok subscription_tier for the
 * Settings card. Raw slugs stay on the wire (`plus`, numeric JWT tier);
 * the UI shows Plus / Pro 20x / Pro 5x / SuperGrok / X Premium+.
 */
export declare const CODEX_PLAN_NAMES: Readonly<{
    free: "Free";
    free_plan: "Free";
    free_trial: "Free";
    go: "Go";
    chatgpt_go: "Go";
    plus: "Plus";
    chatgpt_plus: "Plus";
    pro: "Pro 20x";
    chatgpt_pro: "Pro 20x";
    pro20x: "Pro 20x";
    pro_20x: "Pro 20x";
    chatgpt_pro_20x: "Pro 20x";
    prolite: "Pro 5x";
    pro_lite: "Pro 5x";
    chatgpt_prolite: "Pro 5x";
    chatgpt_pro_lite: "Pro 5x";
    pro5x: "Pro 5x";
    pro_5x: "Pro 5x";
    chatgpt_pro_5x: "Pro 5x";
    team: "Team";
    chatgpt_team: "Team";
    business: "Business";
    enterprise: "Enterprise";
    edu: "Edu";
    education: "Edu";
    student: "Student";
}>;
export declare function formatPlanLabel(raw: any, family: any): any;
export declare function pickPlanRaw(...values: any[]): string | number;
