// Creates the agent_outputs table for the automated agent pipeline.
// Usage: node scripts/setup-agent-outputs.js
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
create table if not exists agent_outputs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  agent_name    text not null,
  output_text   text not null default '',
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  feedback_text text,
  created_at    timestamptz not null default now()
);

alter table agent_outputs enable row level security;

create policy "anon all agent_outputs"
  on agent_outputs for all
  to anon
  using (true)
  with check (true);
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

  if (!res.ok) {
    console.error('Failed:', data)
    process.exit(1)
  }

  console.log('Done!')
  console.log('  ✓ agent_outputs (id, project_id, agent_name, output_text, status, feedback_text, created_at)')
}

run()
