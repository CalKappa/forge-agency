// Deletes duplicate Designer-Wireframe records, keeping only the most recent per project+page.
// Usage: node scripts/cleanup-wireframe-dupes.js
//
// Requires SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL in .env

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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

const SUPABASE_URL    = env.VITE_SUPABASE_URL
const ACCESS_TOKEN    = env.SUPABASE_ACCESS_TOKEN

if (!SUPABASE_URL || !ACCESS_TOKEN) {
  console.error('ERROR: VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN must be set in .env')
  process.exit(1)
}

// Extract project ref from URL: https://<ref>.supabase.co
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0]
const QUERY_URL   = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

const SQL = `
DELETE FROM agent_outputs
WHERE id NOT IN (
  SELECT DISTINCT ON (project_id, agent_name) id
  FROM agent_outputs
  WHERE agent_name LIKE 'Designer-Wireframe-%'
  ORDER BY project_id, agent_name, created_at DESC
)
AND agent_name LIKE 'Designer-Wireframe-%'
`

async function main() {
  console.log('Running wireframe duplicate cleanup...')
  console.log('SQL:', SQL.trim())

  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query: SQL }),
  })

  const body = await res.text()

  if (!res.ok) {
    console.error(`Management API ${res.status}:`, body)
    process.exit(1)
  }

  let result
  try { result = JSON.parse(body) } catch { result = body }

  console.log('Done. Result:', JSON.stringify(result))
}

main().catch(err => { console.error(err); process.exit(1) })
