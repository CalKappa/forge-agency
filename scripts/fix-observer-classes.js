// Fixes IntersectionObserver classList mismatches between Developer-JS and Developer-CSS.
// Fetches each project's JS + CSS, finds all classList.add() calls inside ANY observer
// callback (arrow or traditional function form), cross-references against CSS selectors,
// and patches the JS in-place.
// Usage: node scripts/fix-observer-classes.js
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(line => { const i = line.indexOf('='); return i === -1 ? [line.trim(),''] : [line.slice(0,i).trim(), line.slice(i+1).trim()] })
    .filter(([k]) => k)
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY     = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
  process.exit(1)
}

async function supabaseSelect(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&select=*`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  if (!res.ok) throw new Error(`SELECT ${table} failed: ${await res.text()}`)
  return res.json()
}

async function supabaseUpdate(table, id, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`UPDATE ${table} id=${id} failed: ${await res.text()}`)
}

// Find all classList.add('...') calls inside IntersectionObserver callbacks.
// Handles both arrow-function and traditional function(entries) forms.
function getObserverClassAdds(js) {
  const adds = [] // [{ className, position }]

  // Match: new IntersectionObserver( <callback> , <options> )
  // callback can be:  (entries) => {   OR   function(entries) {
  const observerStart = /new\s+IntersectionObserver\s*\(/g
  let m
  while ((m = observerStart.exec(js)) !== null) {
    // Walk forward to find the callback body's opening brace
    let pos = m.index + m[0].length
    // skip whitespace
    while (pos < js.length && /\s/.test(js[pos])) pos++

    // Identify callback: arrow fn or function keyword
    let bodyStart = -1
    if (js.slice(pos).startsWith('function')) {
      // function(entries) { ...
      const braceIdx = js.indexOf('{', pos)
      if (braceIdx === -1) continue
      bodyStart = braceIdx
    } else if (js.slice(pos).startsWith('(') || /[a-zA-Z]/.test(js[pos])) {
      // (entries) => { ...   OR   entries => { ...
      const arrowIdx = js.indexOf('=>', pos)
      if (arrowIdx === -1) continue
      let after = arrowIdx + 2
      while (after < js.length && /\s/.test(js[after])) after++
      if (js[after] !== '{') continue
      bodyStart = after
    } else {
      continue
    }

    // Find the matching closing brace for the callback body
    let depth = 1
    let i = bodyStart + 1
    while (i < js.length && depth > 0) {
      if (js[i] === '{') depth++
      else if (js[i] === '}') depth--
      i++
    }
    const callbackBody = js.slice(bodyStart, i)
    const bodyOffset = bodyStart

    // Find all classList.add('...') within this callback body
    const addRe = /classList\.add\(['"]([^'"]+)['"]\)/g
    let a
    while ((a = addRe.exec(callbackBody)) !== null) {
      adds.push({ className: a[1], position: bodyOffset + a.index, fullMatch: a[0] })
    }
  }
  return adds
}

// Extract all CSS class names that have visibility-transition rules (opacity, display, visibility, transform)
// Returns a Set<string> of class names (without leading dot)
function getCssVisibilityClasses(css) {
  const vis = new Set()
  // Match selector { body } blocks
  const ruleRe = /([.#][^{]+)\{([^}]+)\}/g
  let m
  while ((m = ruleRe.exec(css)) !== null) {
    const selector = m[1]
    const body = m[2]
    if (/opacity|display\s*:|visibility\s*:|transform\s*:/.test(body)) {
      const classes = selector.match(/\.([a-zA-Z0-9_-]+)/g) || []
      for (const c of classes) vis.add(c.slice(1))
    }
  }
  return vis
}

async function run() {
  console.log('Fetching Developer-JS and Developer-CSS records…')
  const [jsRecs, cssRecs] = await Promise.all([
    supabaseSelect('agent_outputs', 'agent_name=eq.Developer-JS'),
    supabaseSelect('agent_outputs', 'agent_name=eq.Developer-CSS'),
  ])

  console.log(`Found ${jsRecs.length} Developer-JS, ${cssRecs.length} Developer-CSS records`)
  if (!jsRecs.length) { console.log('Nothing to do.'); return }

  const cssMap = Object.fromEntries(cssRecs.map(r => [r.project_id, r]))
  let grandTotal = 0

  for (const jsRec of jsRecs) {
    console.log(`\nProject ${jsRec.project_id}:`)
    const js  = jsRec.output_text || ''
    const css = cssMap[jsRec.project_id]?.output_text || ''

    if (!js) { console.log('  JS output_text empty — skipping'); continue }

    const observerAdds = getObserverClassAdds(js)
    console.log(`  Found ${observerAdds.length} classList.add() call(s) inside IntersectionObserver callbacks:`)
    for (const { className } of observerAdds) {
      console.log(`    · '${className}'`)
    }

    const cssVisClasses = getCssVisibilityClasses(css)
    console.log(`  CSS visibility classes: ${[...cssVisClasses].join(', ') || '(none found)'}`)

    // Determine which observer-added classes are NOT present in CSS (mismatches)
    const mismatches = []
    for (const { className } of observerAdds) {
      if (!cssVisClasses.has(className)) {
        // Find the best CSS candidate
        const candidates = [...cssVisClasses].filter(c =>
          ['visible','active','show','shown','in-view','is-visible','is-active'].includes(c)
        )
        const correct = candidates.includes('visible') ? 'visible'
          : candidates.length === 1 ? candidates[0]
          : null

        if (correct) {
          console.log(`  ✗ '${className}' not in CSS → will replace with '${correct}'`)
          mismatches.push({ wrong: className, correct })
        } else {
          console.log(`  ✗ '${className}' not in CSS → no clear match (manual fix needed); candidates: ${candidates.join(', ') || 'none'}`)
        }
      } else {
        console.log(`  ✓ '${className}' found in CSS`)
      }
    }

    if (!mismatches.length) { console.log('  No mismatches to fix — skipping'); continue }

    // Apply fixes: replace classList.add('<wrong>') → classList.add('<correct>') globally in the JS
    let fixed = js
    let total = 0
    for (const { wrong, correct } of mismatches) {
      const re = new RegExp(`classList\\.add\\(['"]${wrong}['"]\\)`, 'g')
      const count = (fixed.match(re) || []).length
      fixed = fixed.replace(re, `classList.add('${correct}')`)
      console.log(`  Replaced ${count}× classList.add('${wrong}') → classList.add('${correct}')`)
      total += count
    }

    if (fixed === js) { console.log('  No actual changes — skipping save'); continue }

    console.log(`  Saving (${total} replacement(s))…`)
    await supabaseUpdate('agent_outputs', jsRec.id, { output_text: fixed })
    console.log('  ✓ Saved')
    grandTotal += total
  }

  console.log(`\nDone. Total replacements: ${grandTotal}`)
}

run().catch(err => { console.error('Fatal:', err); process.exit(1) })
