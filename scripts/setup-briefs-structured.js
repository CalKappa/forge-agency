import 'dotenv/config'
import fetch from 'node-fetch'

const PROJECT_ID = 'oimojcsxqaajdknltqvx'
const TOKEN      = process.env.SUPABASE_ACCESS_TOKEN

const SQL = `
CREATE TABLE IF NOT EXISTS briefs_structured (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid REFERENCES clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  step1      jsonb,
  step2      jsonb,
  step3      jsonb,
  step4      jsonb,
  step5      jsonb,
  step6      jsonb,
  status     text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE briefs_structured ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'briefs_structured' AND policyname = 'public access'
  ) THEN
    CREATE POLICY "public access" ON briefs_structured FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`

const res  = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`, {
  method:  'POST',
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body:    JSON.stringify({ query: SQL }),
})
const data = await res.json()
console.log(res.ok ? '✓ briefs_structured table created' : '✗ Error:', data)
