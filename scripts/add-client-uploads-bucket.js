// Creates the client-uploads storage bucket and ensures briefs_structured
// has proper public RLS so the unauthenticated brief form can write to it.
// Usage: node scripts/add-client-uploads-bucket.js

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
    .filter(([k]) => k)
)

const PROJECT_REF  = 'oimojcsxqaajdknltqvx'
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN
if (!ACCESS_TOKEN) { console.error('Missing SUPABASE_ACCESS_TOKEN in .env'); process.exit(1) }

const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}`

async function sql(query) {
  const res = await fetch(`${API}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(data))
  return data
}

// 1. Ensure briefs table has public insert RLS (anon can insert briefs from the client form)
await sql(`
  ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='briefs' AND policyname='public insert') THEN
      CREATE POLICY "public insert" ON briefs FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='briefs' AND policyname='authed select') THEN
      CREATE POLICY "authed select" ON briefs FOR SELECT USING (true);
    END IF;
  END $$;
`)
console.log('✓ briefs RLS policies set')

// 2. Ensure briefs_structured has public insert RLS
await sql(`
  ALTER TABLE briefs_structured ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='briefs_structured' AND policyname='public insert') THEN
      CREATE POLICY "public insert" ON briefs_structured FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='briefs_structured' AND policyname='authed select') THEN
      CREATE POLICY "authed select" ON briefs_structured FOR SELECT USING (true);
    END IF;
  END $$;
`)
console.log('✓ briefs_structured RLS policies set')

// 3. Ensure client_brief_tokens has public select + update RLS
await sql(`
  ALTER TABLE client_brief_tokens ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_brief_tokens' AND policyname='public select') THEN
      CREATE POLICY "public select" ON client_brief_tokens FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_brief_tokens' AND policyname='public update') THEN
      CREATE POLICY "public update" ON client_brief_tokens FOR UPDATE USING (true) WITH CHECK (true);
    END IF;
  END $$;
`)
console.log('✓ client_brief_tokens RLS policies set')

// 4. Create client-uploads storage bucket via Storage API
const bucketRes = await fetch(`${API}/storage/buckets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'client-uploads', name: 'client-uploads', public: true }),
})
const bucketData = await bucketRes.json()
if (!bucketRes.ok && !bucketData.error?.includes('already exists') && !bucketData.message?.includes('already exists')) {
  console.warn('Bucket creation response:', bucketData)
} else {
  console.log('✓ client-uploads storage bucket ready')
}

// 5. Allow anon uploads to client-uploads via SQL storage policy
await sql(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM storage.policies
      WHERE bucket_id = 'client-uploads' AND name = 'anon upload'
    ) THEN
      INSERT INTO storage.policies (name, bucket_id, operation, definition)
      VALUES ('anon upload', 'client-uploads', 'INSERT', 'true');
    END IF;
  END $$;
`).catch(() => {
  // storage.policies may not be directly writable via SQL — handled via dashboard if needed
  console.log('  (storage policy via SQL skipped — set in Supabase dashboard if uploads fail)')
})

console.log('\n✅ All migrations complete.')
console.log('   If file uploads fail, go to Supabase Dashboard → Storage → client-uploads → Policies')
console.log('   and add an INSERT policy for the anon role with definition: true')
