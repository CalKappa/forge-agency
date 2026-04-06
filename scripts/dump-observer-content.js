// Dumps the IntersectionObserver sections from Developer-JS and relevant CSS classes from Developer-CSS
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(line => { const i = line.indexOf('='); return i === -1 ? [line.trim(), ''] : [line.slice(0,i).trim(), line.slice(i+1).trim()] })
    .filter(([k]) => k)
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY

async function get(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  })
  return res.json()
}

const [jsRecs, cssRecs] = await Promise.all([
  get('agent_outputs', 'agent_name=eq.Developer-JS'),
  get('agent_outputs', 'agent_name=eq.Developer-CSS'),
])

const js = jsRecs[0]?.output_text ?? ''
const css = cssRecs[0]?.output_text ?? ''

// Show all IntersectionObserver sections in JS
console.log('=== IntersectionObserver sections in Developer-JS ===\n')
const lines = js.split('\n')
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('IntersectionObserver') || lines[i].includes('classList.add')) {
    const start = Math.max(0, i - 2)
    const end = Math.min(lines.length - 1, i + 5)
    console.log(`[lines ${start+1}-${end+1}]:`)
    console.log(lines.slice(start, end+1).join('\n'))
    console.log('---')
  }
}

// Show all CSS rules that relate to visibility/animation on timeline/card classes
console.log('\n=== CSS visibility rules (timeline/card/animate/visible) ===\n')
const cssLines = css.split('\n')
for (let i = 0; i < cssLines.length; i++) {
  const l = cssLines[i]
  if (/(timeline|card|animate|visible|opacity|transform.*translate)/i.test(l)) {
    console.log(`[line ${i+1}]: ${l}`)
  }
}
