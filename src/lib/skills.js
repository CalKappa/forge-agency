/**
 * src/lib/skills.js
 *
 * Loads and caches forge-skills SKILL.md files.
 * Uses Vite's import.meta.glob with eager:true so files are bundled at build
 * time — no fetch() needed, works in dev and production identically.
 *
 * Usage:
 *   import { loadSkill } from './skills'
 *   const skill = await loadSkill('developer')
 */

// Eagerly import every SKILL.md under forge-skills/ as raw text.
// Paths are relative to the project root (leading slash = project root in Vite).
const SKILL_MODULES = import.meta.glob(
  '/forge-skills/**/SKILL.md',
  { query: '?raw', import: 'default', eager: true }
)

const SKILL_MAP = {
  orchestrator: '/forge-skills/using-forge-skills/SKILL.md',
  researcher:   '/forge-skills/using-forge-skills/SKILL.md',
  designer:     '/forge-skills/designer/SKILL.md',
  developer:    '/forge-skills/developer/SKILL.md',
  qa:           '/forge-skills/qa-agent/SKILL.md',
  reviewer:     '/forge-skills/reviewer/SKILL.md',
  debugging:    '/forge-skills/systematic-debugging/SKILL.md',
  planning:     '/forge-skills/writing-plans/SKILL.md',
}

// In-memory cache — redundant with eager loading but kept for API parity with v2
const _cache = {}

/**
 * Returns the SKILL.md content for a named skill.
 * Async signature matches v2 so call sites can await it without changes if
 * the implementation ever switches to fetch().
 *
 * @param {string} skillName  — one of the keys in SKILL_MAP
 * @returns {Promise<string>} — raw SKILL.md text
 */
export async function loadSkill(skillName) {
  if (_cache[skillName]) return _cache[skillName]

  const path = SKILL_MAP[skillName]
  if (!path) {
    throw new Error(
      `[skills] Unknown skill "${skillName}". Valid names: ${Object.keys(SKILL_MAP).join(', ')}`
    )
  }

  const text = SKILL_MODULES[path]
  if (!text) {
    throw new Error(
      `[skills] Skill file not found at "${path}". Check forge-skills/ exists at project root.`
    )
  }

  _cache[skillName] = text
  return text
}
