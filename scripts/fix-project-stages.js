// One-off migration: reset incorrectly-Delivered projects to 'Not Started'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
    .filter(([k]) => k)
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const { data, error } = await supabase
  .from('projects')
  .update({ current_stage: 'Not Started' })
  .eq('current_stage', 'Delivered')
  .select('id, name, current_stage')

if (error) {
  console.error('Migration failed:', error.message)
  process.exit(1)
}

if (data.length === 0) {
  console.log('No projects with current_stage = Delivered found — nothing to update.')
} else {
  console.log(`Updated ${data.length} project(s) to Not Started:`)
  data.forEach(p => console.log(`  • [${p.id}] ${p.name} → ${p.current_stage}`))
}
