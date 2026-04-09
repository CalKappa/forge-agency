// Creates the client_brief_tokens table.
// Usage: node scripts/add-brief-tokens.js

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envPath = resolve(__dirname, '../.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
    .filter(([k]) => k)
)

const PROJECT_REF  = 'oimojcsxqaajdknltqvx'
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN

if (!ACCESS_TOKEN) {
  console.error('ERROR: SUPABASE_ACCESS_TOKEN not found in .env')
  process.exit(1)
}

const SQL = `
CREATE TABLE IF NOT EXISTS client_brief_tokens (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token        text UNIQUE NOT NULL,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  client_id    uuid REFERENCES clients(id) ON DELETE CASCADE,
  status       text DEFAULT 'pending',
  expires_at   timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now(),
  submitted_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS client_brief_tokens_token_idx ON client_brief_tokens(token);
`

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method:  'POST',
  headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body:    JSON.stringify({ query: SQL }),
})

const body = await res.json()
if (!res.ok) {
  console.error('Failed:', body)
  process.exit(1)
}
console.log('✓ client_brief_tokens table created (or already exists)')
