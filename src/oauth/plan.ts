/**
 * Pretty-print ChatGPT / Codex plan_type and Grok subscription_tier for the
 * Settings card. Raw slugs stay on the wire (`plus`, numeric JWT tier);
 * the UI shows Plus / Pro 20x / Pro 5x / SuperGrok / X Premium+.
 */

import { GROK_TIER_NAMES } from './grok/index.js'
import { GLM_PLAN_NAMES } from './glm/index.js'
import { KIRO_PLAN_NAMES } from './kiro/index.js'
import { ANTIGRAVITY_PLAN_NAMES } from './antigravity/index.js'
import { CURSOR_PLAN_NAMES } from './cursor/index.js'
import { OLLAMA_PLAN_NAMES } from './ollama/index.js'
import { OPENCODE_PLAN_NAMES } from './opencode/index.js'

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
  team: 'Team',
  chatgpt_team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu',
  education: 'Edu',
  student: 'Student',
})

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
})

function slugOf(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[_\-\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function compactOf(value) {
  return slugOf(value).replace(/_/g, '')
}

export function formatPlanLabel(raw, family) {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    return GROK_TIER_NAMES[raw] ?? String(raw)
  }
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (/^\d+$/.test(trimmed) && GROK_TIER_NAMES[Number(trimmed)]) {
    return GROK_TIER_NAMES[Number(trimmed)]
  }
  const slug = slugOf(trimmed)
  const compact = compactOf(trimmed)
  if (family === 'glm') {
    if (GLM_PLAN_NAMES[slug]) return GLM_PLAN_NAMES[slug]
    if (GLM_PLAN_NAMES[compact]) return GLM_PLAN_NAMES[compact]
  }
  if (family === 'kiro') {
    if (KIRO_PLAN_NAMES[slug]) return KIRO_PLAN_NAMES[slug]
    if (KIRO_PLAN_NAMES[compact]) return KIRO_PLAN_NAMES[compact]
  }
  if (family === 'antigravity') {
    if (ANTIGRAVITY_PLAN_NAMES[slug]) return ANTIGRAVITY_PLAN_NAMES[slug]
    if (ANTIGRAVITY_PLAN_NAMES[compact]) return ANTIGRAVITY_PLAN_NAMES[compact]
  }
  if (family === 'cursor') {
    if (CURSOR_PLAN_NAMES[slug]) return CURSOR_PLAN_NAMES[slug]
    if (CURSOR_PLAN_NAMES[compact]) return CURSOR_PLAN_NAMES[compact]
  }
  if (family === 'ollama') {
    if (OLLAMA_PLAN_NAMES[slug]) return OLLAMA_PLAN_NAMES[slug]
    if (OLLAMA_PLAN_NAMES[compact]) return OLLAMA_PLAN_NAMES[compact]
  }
  if (family === 'opencode') {
    if (OPENCODE_PLAN_NAMES[slug]) return OPENCODE_PLAN_NAMES[slug]
    if (OPENCODE_PLAN_NAMES[compact]) return OPENCODE_PLAN_NAMES[compact]
  }
  if (family !== 'glm' && family !== 'grok' && family !== 'kiro' && family !== 'antigravity' && family !== 'cursor' && family !== 'ollama' && family !== 'kimi' && family !== 'opencode') {
    if (CODEX_PLAN_NAMES[slug]) return CODEX_PLAN_NAMES[slug]
    if (CODEX_PLAN_NAMES[compact]) return CODEX_PLAN_NAMES[compact]
  }
  if (GLM_PLAN_NAMES[slug] && family !== 'codex') return GLM_PLAN_NAMES[slug]
  if (GROK_PLAN_ALIASES[slug]) return GROK_PLAN_ALIASES[slug]
  if (GROK_PLAN_ALIASES[compact]) return GROK_PLAN_ALIASES[compact]
  const known = Object.values(GROK_TIER_NAMES)
  const match = known.find((name) => name.toLowerCase() === trimmed.toLowerCase())
  if (match) return match
  if (/^[A-Z][A-Za-z0-9+ ]*$/.test(trimmed)) return trimmed
  return trimmed
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function pickPlanRaw(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value)) return value
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}
