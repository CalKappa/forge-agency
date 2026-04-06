// Run once to create the database tables.
// Usage: node scripts/setup-db.js
//
// Requires SUPABASE_ACCESS_TOKEN in .env
// Get yours at: https://supabase.com/dashboard/account/tokens

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dependency needed in Node 20+)
const envPath = resolve(__dirname, '../.env')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
    .filter(([k]) => k)
)

const PROJECT_REF = 'oimojcsxqaajdknltqvx'
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN

if (!ACCESS_TOKEN || ACCESS_TOKEN === 'your-personal-access-token') {
  console.error('ERROR: Add your SUPABASE_ACCESS_TOKEN to .env')
  console.error('Get it at: https://supabase.com/dashboard/account/tokens')
  process.exit(1)
}

const SQL = `
-- clients
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  status      text not null default 'active'
                check (status in ('active', 'inactive', 'lead')),
  notes       text,
  created_at  timestamptz not null default now()
);

-- projects
create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  name           text not null,
  status         text not null default 'active'
                   check (status in ('active', 'completed', 'paused', 'cancelled')),
  current_stage  text,
  created_at     timestamptz not null default now()
);

-- briefs
create table if not exists briefs (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  project_id     uuid references projects(id) on delete set null,
  brief_text     text not null,
  submitted_at   timestamptz not null default now()
);
`

async function run() {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

  console.log('Creating tables...')

  const res = await fetch(url, {
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

  console.log('Done! Tables created:')
  console.log('  ✓ clients  (id, name, email, phone, status, notes, created_at)')
  console.log('  ✓ projects (id, client_id, name, status, current_stage, created_at)')
  console.log('  ✓ briefs   (id, client_id, project_id, brief_text, submitted_at)')
}

run()
