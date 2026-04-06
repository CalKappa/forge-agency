// Adds any columns to agent_outputs that may be missing.
// Safe to run multiple times — uses ADD COLUMN IF NOT EXISTS throughout.
// Usage: node scripts/add-missing-columns.js
// Requires SUPABASE_ACCESS_TOKEN in .env

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=')
      return idx === -1 ? [line.trim(), ''] : [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
    .filter(([k]) => k)
)

const PROJECT_REF  = 'oimojcsxqaajdknltqvx'
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN

if (!ACCESS_TOKEN || ACCESS_TOKEN === 'your-personal-access-token') {
  console.error('ERROR: Add your SUPABASE_ACCESS_TOKEN to .env')
  process.exit(1)
}

const SQL = `
ALTER TABLE agent_outputs
  ADD COLUMN IF NOT EXISTS token_usage     jsonb,
  ADD COLUMN IF NOT EXISTS output_css      text,
  ADD COLUMN IF NOT EXISTS output_html     text,
  ADD COLUMN IF NOT EXISTS output_wireframe text;
`

async function run() {
  console.log('Running migration: add missing columns to agent_outputs…')

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('Migration failed:', data)
    process.exit(1)
  }

  console.log('Migration complete!')
  console.log('  ✓ agent_outputs.token_usage      (jsonb)  — token counts per API call')
  console.log('  ✓ agent_outputs.output_css        (text)   — raw CSS output')
  console.log('  ✓ agent_outputs.output_html       (text)   — raw HTML output')
  console.log('  ✓ agent_outputs.output_wireframe  (text)   — SVG wireframe')
}

run()
