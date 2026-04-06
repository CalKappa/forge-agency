// Backfills the pages column for projects that have a brief but pages = null.
// Usage: node scripts/backfill-pages.js
//
// Requires VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_ANTHROPIC_API_KEY in .env

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load .env ─────────────────────────────────────────────────────────────────
const envPath = resolve(__dirname, '../.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
    .filter(([k]) => k)
)

const SUPABASE_URL  = env.VITE_SUPABASE_URL
const SUPABASE_KEY  = env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_KEY = env.VITE_ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('ERROR: VITE_ANTHROPIC_API_KEY must be set in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const PAGE_EXTRACTOR_SYSTEM = `Output ONLY a valid JSON array of page objects. Every page must have a unique filename. Never include the same page twice. The homepage must appear exactly once with filename index.html. For filenames use only lowercase letters, numbers and hyphens — no special characters, no ampersands, no spaces. For page names use plain readable English with no special characters — replace ampersands with the word and. Each object must have two keys: name which is the page name for example Home, About, Services, Contact, and filename which is the HTML filename for example index.html, about.html, services.html, contact.html. Output only the raw JSON array with no explanation and no markdown code blocks.`

function sanitiseExtractedPages(pages) {
  return pages
    .map(p => ({
      name:     p.name.replace(/&/g, 'and').replace(/[^a-zA-Z0-9 \-\.]/g, '').trim(),
      filename: p.filename.replace(/&/g, 'and').replace(/[^a-zA-Z0-9\s\-\.]/g, '').replace(/\s+/g, '-').toLowerCase(),
    }))
    .filter((page, index, self) => index === self.findIndex(p => p.filename === page.filename))
}

// ── Anthropic SSE call (simplified — collects full text, no streaming needed) ──
async function extractPages(briefText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system:     PAGE_EXTRACTOR_SYSTEM,
      messages:   [{ role: 'user', content: briefText }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err}`)
  }

  const json = await res.json()
  const raw  = json.content?.[0]?.text ?? ''
  console.log('  Raw API response:', raw.slice(0, 200))
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const parsed = JSON.parse(cleaned)
  console.log('  Parsed pages:', JSON.stringify(parsed))
  const pages = sanitiseExtractedPages(parsed)
  console.log('  Final clean pages:', JSON.stringify(pages))
  return pages
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Find all projects where pages IS NULL
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name, client_id')
    .is('pages', null)

  if (projErr) { console.error('Failed to fetch projects:', projErr.message); process.exit(1) }
  if (!projects.length) { console.log('No projects with null pages — nothing to do.'); return }

  console.log(`Found ${projects.length} project(s) with null pages:\n`)

  let succeeded = 0
  let failed    = 0

  for (const proj of projects) {
    console.log(`Processing: ${proj.name} (${proj.id})`)

    // 2. Fetch the most recent brief for this project
    const { data: briefs } = await supabase
      .from('briefs')
      .select('brief_text')
      .eq('project_id', proj.id)
      .order('submitted_at', { ascending: false })
      .limit(1)

    const briefText = briefs?.[0]?.brief_text
    if (!briefText) {
      console.log('  ⚠ No brief found — skipping')
      failed++
      continue
    }

    // 3. Extract pages via API
    try {
      const pages = await extractPages(briefText)
      if (!Array.isArray(pages) || !pages.length) {
        console.log('  ⚠ API returned empty array — skipping')
        failed++
        continue
      }
      console.log('  Extracted pages:', JSON.stringify(pages))

      // 4. Save to projects table
      const { error: saveErr } = await supabase
        .from('projects')
        .update({ pages })
        .eq('id', proj.id)

      if (saveErr) {
        console.error('  ✗ Save failed:', saveErr.message)
        failed++
      } else {
        console.log(`  ✓ Saved ${pages.length} page(s)`)
        succeeded++
      }
    } catch (err) {
      console.error('  ✗ Extraction failed:', err.message)
      failed++
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed/skipped.`)
}

main().catch(err => { console.error(err); process.exit(1) })
