// Adds output_html column to agent_outputs for the Designer agent wireframe.
// Usage: node scripts/add-agent-outputs-html.js
// Requires SUPABASE_ACCESS_TOKEN in .env

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
    .filter(([k]) => k)
)

const PROJECT_REF  = 'oimojcsxqaajdknltqvx'
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN

if (!ACCESS_TOKEN || ACCESS_TOKEN === 'your-personal-access-token') {
  console.error('ERROR: Add your SUPABASE_ACCESS_TOKEN to .env')
  process.exit(1)
}

const SQL = `
alter table agent_outputs
  add column if not exists output_html text;
`

async function run() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  })

  const data = await res.json()
  if (!res.ok) { console.error('Failed:', data); process.exit(1) }

  console.log('Done!')
  console.log('  ✓ agent_outputs.output_html (text) column added')
}

run()
