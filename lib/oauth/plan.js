/**
 * Pretty-print ChatGPT / Codex plan_type and Grok subscription_tier for the
 * Settings card. Raw slugs stay on the wire (`plus`, numeric JWT tier);
 * the UI shows Plus / Pro 20x / Pro 5x / SuperGrok / X Premium+.
 */
import { GROK_TIER_NAMES } from './grok/index.js';
import { GLM_PLAN_NAMES } from './glm/index.js';
import { KIRO_PLAN_NAMES } from './kiro/index.js';
import { ANTIGRAVITY_PLAN_NAMES } from './antigravity/index.js';
import { CURSOR_PLAN_NAMES } from './cursor/index.js';
import { OLLAMA_PLAN_NAMES } from '../apikey/ollama/index.js';
import { COPILOT_PLAN_NAMES } from './copilot/index.js';
import { DEVIN_PLAN_NAMES, DEVIN_TIER_NAMES } from './devin/index.js';
import { CLINE_PLAN_NAMES } from './cline/index.js';
import { commandCodePlanLabel } from '../apikey/command-code/quota.js';
/** First truthy hit among the candidate keys — the slug-then-compact order every family branch used. */
function planNameOf(table, ...keys) {
    for (const key of keys) {
        const label = table[key];
        if (label)
            return label;
    }
    return undefined;
}
/** Numeric tier lookup; an unknown tier returns undefined and the caller falls back to the number. */
function tierNameOf(table, tier) {
    return table[tier];
}
export const CODEX_PLAN_NAMES = Object.freeze({
    free: 'Free',
    free_plan: 'Free',
    free_trial: 'Free',
    go: 'Go',
    chatgpt_go: 'Go',
    plus: 'Plus',
    chatgpt_plus: 'Plus',
    // $200 Pro = 20× Plus Codex usage. $100 Pro Lite = 5×. JWT/usage slug is
    // `pro` vs `prolite` (openai/codex#29243, help article 9793128).
    pro: 'Pro 20x',
    chatgpt_pro: 'Pro 20x',
    pro20x: 'Pro 20x',
    pro_20x: 'Pro 20x',
    chatgpt_pro_20x: 'Pro 20x',
    prolite: 'Pro 5x',
    pro_lite: 'Pro 5x',
    chatgpt_prolite: 'Pro 5x',
    chatgpt_pro_lite: 'Pro 5x',
    pro5x: 'Pro 5x',
    pro_5x: 'Pro 5x',
    chatgpt_pro_5x: 'Pro 5x',
    // openai/codex#47971 (2026-09-25): a new `promax` slug above `pro`. Its
    // multiplier is not published, so it carries none.
    promax: 'Pro Max',
    pro_max: 'Pro Max',
    chatgpt_promax: 'Pro Max',
    chatgpt_pro_max: 'Pro Max',
    team: 'Team',
    chatgpt_team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise',
    edu: 'Edu',
    education: 'Edu',
    student: 'Student',
});
const GROK_PLAN_ALIASES = Object.freeze({
    free: 'Free',
    supergrok: 'SuperGrok',
    super_grok: 'SuperGrok',
    xbasic: 'X Basic',
    x_basic: 'X Basic',
    xpremium: 'X Premium',
    x_premium: 'X Premium',
    xpremiumplus: 'X Premium+',
    x_premium_plus: 'X Premium+',
    x_premiumplus: 'X Premium+',
    supergrokheavy: 'SuperGrok Heavy',
    super_grok_heavy: 'SuperGrok Heavy',
    // /v1/user subscriptionTier enum: SuperGrokPro = Heavy
    supergrokpro: 'SuperGrok Heavy',
    super_grok_pro: 'SuperGrok Heavy',
    supergroklite: 'SuperGrok Lite',
    super_grok_lite: 'SuperGrok Lite',
    supergrokplus: 'SuperGrok Plus',
    super_grok_plus: 'SuperGrok Plus',
});
function slugOf(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/\+/g, 'plus')
        .replace(/[_\-\s]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}
function compactOf(value) {
    return slugOf(value).replace(/_/g, '');
}
export function formatPlanLabel(raw, family) {
    if (raw === undefined || raw === null)
        return undefined;
    if (family === 'devin' && typeof raw === 'number' && Number.isInteger(raw)) {
        return tierNameOf(DEVIN_TIER_NAMES, raw) ?? String(raw);
    }
    if (typeof raw === 'number' && Number.isInteger(raw)) {
        return tierNameOf(GROK_TIER_NAMES, raw) ?? String(raw);
    }
    if (typeof raw !== 'string')
        return undefined;
    const trimmed = raw.trim();
    if (!trimmed)
        return undefined;
    if (/^\d+$/.test(trimmed)) {
        const tier = tierNameOf(GROK_TIER_NAMES, Number(trimmed));
        if (tier)
            return tier;
    }
    const slug = slugOf(trimmed);
    const compact = compactOf(trimmed);
    if (family === 'glm') {
        const label = planNameOf(GLM_PLAN_NAMES, slug, compact);
        if (label)
            return label;
    }
    if (family === 'kiro') {
        const label = planNameOf(KIRO_PLAN_NAMES, slug, compact);
        if (label)
            return label;
    }
    if (family === 'antigravity') {
        const label = planNameOf(ANTIGRAVITY_PLAN_NAMES, slug, compact);
        if (label)
            return label;
    }
    if (family === 'cursor') {
        const label = planNameOf(CURSOR_PLAN_NAMES, slug, compact);
        if (label)
            return label;
    }
    if (family === 'ollama') {
        const label = planNameOf(OLLAMA_PLAN_NAMES, slug, compact);
        if (label)
            return label;
    }
    if (family === 'copilot') {
        const label = planNameOf(COPILOT_PLAN_NAMES, slug, compact);
        if (label)
            return label;
    }
    if (family === 'cline') {
        const label = planNameOf(CLINE_PLAN_NAMES, slug, compact);
        if (label)
            return label;
    }
    if (family === 'devin') {
        const label = planNameOf(DEVIN_PLAN_NAMES, slug, compact);
        if (label)
            return label;
        // `teams_tier` may arrive as a numeric string (16 = Devin Pro).
        if (/^\d+$/.test(trimmed)) {
            const tier = tierNameOf(DEVIN_TIER_NAMES, Number(trimmed));
            if (tier)
                return tier;
        }
    }
    if (family === 'command-code') {
        // planId spellings ('individual-pro', 'pro', 'max') share slugs with the
        // Codex table — resolve through the Command Code map first.
        const label = commandCodePlanLabel(trimmed);
        if (label)
            return label;
    }
    if (family !== 'glm' && family !== 'grok' && family !== 'kiro' && family !== 'antigravity' && family !== 'cursor' && family !== 'ollama' && family !== 'kimi' && family !== 'copilot' && family !== 'devin' && family !== 'cline' && family !== 'command-code') {
        const label = planNameOf(CODEX_PLAN_NAMES, slug, compact);
        if (label)
            return label;
    }
    if (family !== 'codex' && family !== 'chatgpt') {
        const label = planNameOf(GLM_PLAN_NAMES, slug);
        if (label)
            return label;
    }
    const alias = planNameOf(GROK_PLAN_ALIASES, slug, compact);
    if (alias)
        return alias;
    const known = Object.values(GROK_TIER_NAMES);
    const match = known.find((name) => name.toLowerCase() === trimmed.toLowerCase());
    if (match)
        return match;
    if (/^[A-Z][A-Za-z0-9+ ]*$/.test(trimmed))
        return trimmed;
    return trimmed
        .replace(/[_\-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
export function pickPlanRaw(...values) {
    for (const value of values) {
        if (typeof value === 'number' && Number.isInteger(value))
            return value;
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return undefined;
}
