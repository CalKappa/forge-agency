import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { streamAnthropicCall } from '../lib/streamHelper'
import { AGENT_CONFIG, COLOR_CLASSES } from '../lib/agents'

const MODELS = [
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 3.5',  desc: 'Fast · Lightweight' },
  { id: 'claude-sonnet-4-20250514',   label: 'Sonnet 4.5', desc: 'Balanced'            },
  { id: 'claude-opus-4-20250514',     label: 'Opus 4.5',   desc: 'Most powerful'       },
]
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

function storageKey(agentKey) { return `forge_agent_model_${agentKey}` }

// ── Quick actions (SEO Specialist only) ───────────────────────────────────────

const SEO_QUICK_ACTIONS = [
  { label: 'Audit a URL',          prompt: 'Please conduct a full SEO audit of this website. Use web search to analyse the site yourself and provide specific findings: [URL here]' },
  { label: 'Keyword Research',     prompt: 'I need keyword research for a business in the following niche. Identify high-value keywords, search intent, and content opportunities: ' },
  { label: 'Write Meta Tags',      prompt: 'Please write an optimised title tag (50-60 characters) and meta description (150-160 characters) for the following page: ' },
  { label: 'Review Content',       prompt: 'Please review the following content for SEO and readability. Identify improvements for keyword targeting, structure, and engagement:\n\n' },
  { label: 'Local SEO Advice',     prompt: 'I need local SEO advice for the following business. How can they improve their local search visibility and Google Business Profile? Business details: ' },
  { label: 'Technical SEO Check',  prompt: 'Please give me a technical SEO checklist and recommendations for the following website: ' },
]

const WEB_SEARCH_TOOLS   = [{ type: 'web_search_20250305', name: 'web_search' }]
const WEB_SEARCH_HEADERS = { 'anthropic-beta': 'web-search-2025-03-05' }

// ── SEO content detection ─────────────────────────────────────────────────────

const SEO_KEYWORDS = ['seo', 'score', 'recommendation', 'audit', 'needs work', 'critical',
                      'keyword', 'ranking', 'meta description', 'page title', 'sitemap',
                      'backlink', 'crawl', 'index']

function isSeoContent(content) {
  if (!content || content.length < 150) return false
  const lower = content.toLowerCase()
  return SEO_KEYWORDS.filter(k => lower.includes(k)).length >= 3
}

function extractUrlFromText(text) {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s\)\"<>\]\[,]+/i)
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null
}

function urlToDomain(url) {
  if (!url) return 'website'
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0] || 'website' }
}

// ── HTML-to-print PDF generator ───────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stripMd(text) {
  return String(text ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

const STATUS_COLOR   = { Good: '#22c55e', 'Needs Work': '#f59e0b', Critical: '#ef4444' }
const PRIORITY_COLOR = { High: '#ef4444', Medium: '#f59e0b', Low: '#22c55e' }

function parseSeoReport(rawContent) {
  const lines  = rawContent.split('\n')
  const result = { sections: [], score: null, recommendations: [] }
  let mode = 'intro'
  let cur  = null
  let rec  = null

  const pushSec = () => { if (cur) { result.sections.push(cur); cur = null } }
  const pushRec = () => { if (rec) { result.recommendations.push(rec); rec = null } }

  for (const raw of lines) {
    const t = raw.trim()

    // Detect score anywhere in the document
    if (result.score === null) {
      const sm = t.match(/\b(\d{1,3})\s*(?:\/|out\s*of)\s*100\b/i)
      if (sm) result.score = parseInt(sm[1], 10)
    }

    // Major heading ##
    if (t.startsWith('## ')) {
      pushSec(); pushRec()
      const h    = t.slice(3).trim()
      const tlm  = h.match(/\b(Good|Needs Work|Critical)\b/)
      const name = h
        .replace(/\s*[—–\-]\s*(Good|Needs Work|Critical)\s*/g, '')
        .replace(/:\s*(Good|Needs Work|Critical)\s*/g, '')
        .trim()

      if (/overall.*score|score.*summ|seo\s*score/i.test(h))   { mode = 'score'; continue }
      if (/recommend|action|next\s*step|improvement/i.test(h)) { mode = 'recs';  continue }

      mode = 'section'
      cur  = { name, status: tlm?.[1] ?? null, items: [] }
      continue
    }

    // Minor heading ###
    if (t.startsWith('### ')) {
      if (mode === 'section' && cur) cur.items.push({ type: 'sub', text: stripMd(t.slice(4)) })
      continue
    }

    // Numbered item — only consume in recs mode
    const nm = t.match(/^(\d+)\.\s+(.+)/)
    if (nm && mode === 'recs') {
      pushRec()
      const raw2 = nm[2]
      const prm  = raw2.match(/\b(High|Medium|Low)\s*Priority\b/i) ?? raw2.match(/Priority[:\s]*(High|Medium|Low)/i)
      const pri  = prm ? (prm[1][0].toUpperCase() + prm[1].slice(1).toLowerCase()) : null
      const clean = raw2
        .replace(/\s*[—–\-]\s*(High|Medium|Low)\s*Priority/gi, '')
        .replace(/Priority[:\s]*(High|Medium|Low)/gi, '').trim()
      const bm = clean.match(/^\*\*(.+?)\*\*[—–:\s]*(.*)/)
      rec = {
        num:      nm[1],
        title:    bm ? stripMd(bm[1]) : clean.split(/[.:]/)[0].slice(0, 80).trim(),
        body:     bm ? stripMd(bm[2]).trim() : '',
        priority: pri,
      }
      continue
    }

    // Section content
    if (mode === 'section' && cur) {
      if (t.startsWith('- ') || t.startsWith('* '))
        cur.items.push({ type: 'bullet', text: stripMd(t.slice(2)) })
      else if (nm)
        cur.items.push({ type: 'num', num: nm[1], text: stripMd(nm[2]) })
      else if (t && t !== '---')
        cur.items.push({ type: 'para', text: stripMd(t) })
    }

    // Recommendation body continuation
    if (mode === 'recs' && rec && t && !nm)
      rec.body += (rec.body ? ' ' : '') + stripMd(t)
  }

  pushSec(); pushRec()
  return result
}

function buildReportHTML(content, websiteUrl, dateStr, domain) {
  const p          = parseSeoReport(content)
  const scoreColor = p.score === null ? '#6b7280'
                   : p.score >= 80    ? '#22c55e'
                   : p.score >= 50    ? '#f59e0b'
                   :                    '#ef4444'

  // Section items renderer
  const itemsHtml = items => items.map(it => {
    if (it.type === 'sub')
      return '<div style="font-size:12px;font-weight:bold;color:#333;margin:10px 0 3px;">' + esc(it.text) + '</div>'
    if (it.type === 'bullet')
      return '<div style="display:flex;gap:7px;margin:3px 0;font-size:11px;color:#444;line-height:1.6;">' +
        '<span style="margin-top:7px;width:5px;height:5px;flex-shrink:0;border-radius:50%;background:#aaa;display:inline-block;"></span>' +
        '<span>' + esc(it.text) + '</span></div>'
    if (it.type === 'num')
      return '<div style="display:flex;gap:7px;margin:3px 0;font-size:11px;color:#444;line-height:1.6;">' +
        '<span style="font-weight:bold;color:#555;flex-shrink:0;">' + esc(it.num) + '.</span>' +
        '<span>' + esc(it.text) + '</span></div>'
    return '<p style="font-size:11px;color:#444;margin:3px 0;line-height:1.6;">' + esc(it.text) + '</p>'
  }).join('')

  // Audit section cards with traffic-light left border + status circle
  const sectionCards = p.sections.map(s => {
    const color  = STATUS_COLOR[s.status] ?? '#6b7280'
    const circle = s.status
      ? '<div style="flex-shrink:0;width:68px;height:68px;border-radius:50%;background:' + color + ';' +
        'display:flex;align-items:center;justify-content:center;margin-left:16px;align-self:flex-start;margin-top:2px;">' +
        '<span style="color:white;font-weight:bold;font-size:10px;text-align:center;padding:6px;line-height:1.3;">' + esc(s.status) + '</span></div>'
      : ''
    return '<div style="border-left:4px solid ' + color + ';background:#fafafa;padding:14px 18px;' +
      'margin-bottom:14px;border-radius:0 8px 8px 0;display:flex;align-items:flex-start;' +
      'justify-content:space-between;page-break-inside:avoid;">' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:14px;font-weight:bold;color:#1a1a1a;margin-bottom:7px;">' + esc(s.name) + '</div>' +
      itemsHtml(s.items) + '</div>' + circle + '</div>'
  }).join('')

  // Recommended action cards with priority badge
  const recCards = p.recommendations.map(r => {
    const pColor = PRIORITY_COLOR[r.priority]
    const badge  = pColor
      ? '<span style="position:absolute;top:11px;right:11px;background:' + pColor + ';color:white;' +
        'font-size:9px;font-weight:bold;padding:2px 8px;border-radius:10px;">' + esc(r.priority) + '</span>'
      : ''
    return '<div style="background:#f8f8f8;border-radius:8px;padding:13px 15px;margin-bottom:11px;' +
      'position:relative;page-break-inside:avoid;">' + badge +
      '<div style="font-weight:bold;font-size:13px;color:#1a1a1a;margin-bottom:5px;' +
      'padding-right:' + (pColor ? '60px' : '0') + ';">' + esc(r.title) + '</div>' +
      (r.body ? '<div style="font-size:11px;color:#555;line-height:1.6;">' + esc(r.body) + '</div>' : '') +
      '</div>'
  }).join('')

  // Score circle block on cover page
  const scoreBlock = p.score !== null
    ? '<div style="display:flex;align-items:center;gap:24px;margin:28px 0 8px;">' +
      '<div style="width:120px;height:120px;border-radius:50%;border:8px solid ' + scoreColor + ';' +
      'display:flex;align-items:center;justify-content:center;flex-direction:column;flex-shrink:0;">' +
      '<span style="font-size:36px;font-weight:bold;color:' + scoreColor + ';line-height:1;">' + p.score + '</span>' +
      '<span style="font-size:11px;color:#888;margin-top:2px;">out of 100</span></div>' +
      '<div><div style="font-size:16px;font-weight:bold;color:#1a1a1a;">Overall SEO Score</div>' +
      '<div style="font-size:12px;color:#666;margin-top:4px;line-height:1.6;">' +
      (p.score >= 80
        ? 'Strong SEO performance — minor improvements available.'
        : p.score >= 50
        ? 'Moderate performance — targeted improvements will drive meaningful gains.'
        : 'Significant improvements needed. Addressing critical issues will have high impact.') +
      '</div></div></div>'
    : ''

  // Fallback: render full content as plain text if no sections were parsed
  const hasContent = sectionCards.trim() || recCards.trim()
  const fallback   = !hasContent
    ? '<div style="white-space:pre-wrap;font-size:12px;color:#444;line-height:1.7;">' +
      esc(content
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')) +
      '</div>'
    : ''

  const footerRight  = (websiteUrl ? esc(websiteUrl) + ' · ' : '') + esc(dateStr)
  const coverWebsite = websiteUrl
    ? '<div style="margin-bottom:6px;">' +
      '<div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Website Audited</div>' +
      '<div style="font-size:14px;color:#0d7e7e;font-weight:600;">' + esc(websiteUrl) + '</div></div>'
    : ''

  const month = new Date().toLocaleDateString('en-GB', { month: 'long' })
  const year  = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SEO-Audit-${esc(domain)}-${month}-${year}</title>
<style>
  @page { margin: 20mm; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 1.7;
    color: #1a1a1a;
    background: white;
    padding-bottom: 40px;
  }
  .cover {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    page-break-after: always;
  }
  .footer {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    border-top: 1px solid #e5e5e5;
    background: white;
    padding: 7px 20mm;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #aaa;
  }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="footer">
  <span>Prepared by Forge Agency</span>
  <span>${footerRight}</span>
</div>

<div class="cover">
  <div style="background:#1a2a4a;min-height:25vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;">
    <div style="font-size:28px;font-weight:bold;color:white;letter-spacing:0.5px;margin-bottom:8px;">Forge Agency</div>
    <div style="font-size:16px;color:rgba(255,255,255,0.7);">SEO Audit Report</div>
  </div>
  <div style="padding:40px 48px;flex:1;">
    ${coverWebsite}
    <div style="font-size:12px;color:#888;margin-bottom:20px;">${esc(dateStr)}</div>
    <div style="height:2px;background:#0d7e7e;width:64px;border-radius:2px;margin-bottom:32px;"></div>
    ${scoreBlock}
  </div>
</div>

<div style="padding-top:8px;padding-bottom:48px;">
  ${sectionCards.trim() ? '<h2 style="font-size:15px;font-weight:bold;color:#1a1a1a;margin:0 0 14px;padding-bottom:6px;border-bottom:1px solid #e5e5e5;">Audit Findings</h2>' + sectionCards : ''}
  ${recCards.trim() ? '<h2 style="font-size:15px;font-weight:bold;color:#1a1a1a;margin:24px 0 14px;padding-bottom:6px;border-bottom:1px solid #e5e5e5;">Recommended Actions</h2>' + recCards : ''}
  ${fallback}
</div>

</body>
</html>`
}

function generateSeoReportPDF(content, websiteUrl) {
  const domain  = urlToDomain(websiteUrl)
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const html    = buildReportHTML(content, websiteUrl, dateStr, domain)

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    alert('Please allow pop-ups for this site to generate the PDF report.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  // Brief delay so the browser fully renders before the print dialog opens
  setTimeout(() => win.print(), 600)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentChat() {
  const { agentKey } = useParams()
  const navigate     = useNavigate()
  const location     = useLocation()
  const agent        = AGENT_CONFIG[agentKey]

  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(true)
  const [streaming,  setStreaming]  = useState(false)
  const [model,      setModel]      = useState(
    () => localStorage.getItem(storageKey(agentKey)) ?? DEFAULT_MODEL
  )
  // Tracks the most recent SEO analysis response for "Download Last Report"
  const [lastReport,     setLastReport]     = useState(null) // { content, websiteUrl }
  const [showcaseLabel,    setShowcaseLabel]    = useState('')
  const [showcaseProgress, setShowcaseProgress] = useState('') // 'Generating CSS…' | 'Generating JavaScript…' | 'Generating HTML…'
  const [lastShowcaseHtml, setLastShowcaseHtml] = useState('')
  const [showcaseFiles,    setShowcaseFiles]    = useState({}) // msgId → { css, js, html }

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const streamRef = useRef('')

  useEffect(() => {
    if (!agent) { navigate('/agents', { replace: true }); return }
    setModel(localStorage.getItem(storageKey(agentKey)) ?? DEFAULT_MODEL)
    setLastReport(null)
    const briefText = location.state?.briefText ?? null
    if (briefText) navigate(location.pathname, { replace: true, state: null })
    loadChat(briefText)
  }, [agentKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadChat(briefText = null) {
    setLoading(true)
    const { data } = await supabase
      .from('agent_messages')
      .select('id, role, content, created_at')
      .eq('agent_key', agentKey)
      .order('created_at', { ascending: true })

    const loaded = data ?? []
    setMessages(loaded)
    setLoading(false)

    if (briefText && loaded.length === 0) {
      await sendMessage(briefText, loaded)
    } else {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }

  async function sendMessage(text, priorMessages) {
    if (!text.trim() || streaming) return

    setStreaming(true)
    streamRef.current = ''

    const tempUserMsg = {
      id: crypto.randomUUID(), role: 'user',
      content: text, created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    await supabase.from('agent_messages').insert({
      agent_key: agentKey, role: 'user', content: text,
    })

    const history = [...priorMessages, tempUserMsg].map(m => ({
      role: m.role, content: m.content,
    }))

    const tempAssistantId = crypto.randomUUID()
    setMessages(prev => [...prev, {
      id: tempAssistantId, role: 'assistant', content: '', streaming: true, searches: [],
    }])

    try {
      await streamAnthropicCall({
        messages:     history,
        systemPrompt: agent.system,
        skillName:    agent.skillName,
        model,
        maxTokens:    2048,
        tools:        WEB_SEARCH_TOOLS,
        extraHeaders: WEB_SEARCH_HEADERS,
        onToolUse: (_name, input) => {
          const query = input.query || input.url || Object.values(input)[0] || ''
          const label = String(query).slice(0, 120)
          setMessages(prev => prev.map(m => {
            if (m.id !== tempAssistantId) return m
            return {
              ...m,
              searches: [
                ...(m.searches ?? []).map(s => ({ ...s, done: true })),
                { query: label, done: false },
              ],
            }
          }))
        },
        onChunk: chunk => {
          streamRef.current += chunk
          const captured = streamRef.current
          setMessages(prev => prev.map(m => {
            if (m.id !== tempAssistantId) return m
            return {
              ...m,
              content: captured,
              searches: (m.searches ?? []).map(s => ({ ...s, done: true })),
            }
          }))
        },
      })

      const finalContent = streamRef.current

      const { data: saved } = await supabase
        .from('agent_messages')
        .insert({ agent_key: agentKey, role: 'assistant', content: finalContent })
        .select('id, created_at')
        .single()

      setMessages(prev =>
        prev.map(m =>
          m.id === tempAssistantId
            ? { id: saved.id, role: 'assistant', content: finalContent, created_at: saved.created_at }
            : m
        )
      )

      // Track last HTML showcase for View / Regenerate buttons
      const trimmed = finalContent.trimStart()
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        setLastShowcaseHtml(finalContent)
      }

      // Track last SEO report for the header "Download Last Report" button
      if (agentKey === 'seo-specialist' && isSeoContent(finalContent)) {
        const allContext = [...priorMessages, tempUserMsg]
        const websiteUrl =
          extractUrlFromText(finalContent) ??
          allContext.slice().reverse().map(m => extractUrlFromText(m.content)).find(Boolean) ??
          null
        setLastReport({ content: finalContent, websiteUrl })
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === tempAssistantId
            ? { ...m, content: `Error: ${err.message}`, streaming: false, error: true }
            : m
        )
      )
    }

    setStreaming(false)
    streamRef.current = ''
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  function downloadShowcaseFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function stripFences(response) {
    return response.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
  }

  function buildCombinedHtml({ css, js, html }) {
    return html
      .replace(/<link[^>]*href=["']styles\.css["'][^>]*\/?>/gi, `<style>\n${css}\n</style>`)
      .replace(/<script[^>]*src=["']script\.js["'][^>]*><\/script>/gi, `<script>\n${js}\n</script>`)
  }

  function previewShowcase(files) {
    const blob = new Blob([buildCombinedHtml(files)], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  async function generateShowcase() {
    if (streaming) return

    const colourSchemes = [
      'deep space (blacks and electric blues)',
      'neon noir (dark with hot pink and cyan)',
      'forest dark (deep greens and gold)',
      'volcanic (dark with orange and red)',
      'arctic (near white with ice blue)',
      'cyberpunk (black with purple and yellow)',
      'ocean deep (navy with teal and coral)',
      'monochrome plus (black and white with one vivid accent)',
    ]

    const creativeStyles = [
      'premium creative agency',
      'futuristic tech product',
      'luxury fashion brand',
      'indie music festival',
      'architectural studio',
      'gaming and esports',
    ]

    const effectsPool = [
      'particle background with mouse interaction',
      'typewriter text',
      'fade and slide up on scroll',
      'staggered card reveals',
      'parallax background',
      'counter animation',
      'morphing gradient background',
      'split text animation',
      'magnetic button effect',
      'image reveal wipe',
      '3D card tilt on hover',
      'animated progress bars',
      'floating elements',
      'text scramble effect',
      'scroll progress bar',
      'particle burst on click',
      'smooth infinite marquee',
      'custom mouse cursor follower',
      'GSAP accordion',
      'animated statistics with circular rings',
      'horizontal scroll section',
      'SVG path drawing on scroll',
      'ripple effect on click',
      'glitch text effect',
      'neon glow pulse animation',
      'elastic bounce reveals',
      'blur to sharp image reveal',
      'colour shifting background on scroll',
      'spotlight follow mouse effect',
      'confetti burst animation',
      'liquid blob morphing background',
      'word by word text reveal',
      'rotating 3D cube',
      'diagonal wipe transitions',
      'breathing scale pulse on hero elements',
    ]

    // Random selections
    const selectedColour  = colourSchemes[Math.floor(Math.random() * colourSchemes.length)]
    const selectedStyle   = creativeStyles[Math.floor(Math.random() * creativeStyles.length)]

    for (let i = effectsPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[effectsPool[i], effectsPool[j]] = [effectsPool[j], effectsPool[i]]
    }
    const selectedEffects = effectsPool.slice(0, Math.floor(Math.random() * 7) + 22)
    const effectsList     = selectedEffects.join(', ')

    setShowcaseLabel(`Generating: ${selectedColour} — ${selectedStyle} — ${selectedEffects.length} effects`)
    console.log('Selected colour scheme:', selectedColour)
    console.log('Selected creative style:', selectedStyle)
    console.log('Selected effects:', selectedEffects)

    setStreaming(true)

    // Insert user message
    const userContent = `Generate Animation Showcase — ${selectedStyle} — ${selectedColour} — ${selectedEffects.length} effects`
    const tempUserMsg = { id: crypto.randomUUID(), role: 'user', content: userContent, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, tempUserMsg])
    await supabase.from('agent_messages').insert({ agent_key: agentKey, role: 'user', content: userContent })

    // Temp assistant message used for progress display
    const tempAssistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: tempAssistantId, role: 'assistant', content: 'Generating CSS…', streaming: true }])

    try {
      // ── Step 1: CSS ─────────────────────────────────────────────
      setShowcaseProgress('Generating CSS…')
      let cssContent = ''
      await streamAnthropicCall({
        messages:     [{ role: 'user', content: `Generate CSS for an animation showcase in the style of a ${selectedStyle} using the ${selectedColour} colour scheme for these effects: ${effectsList}` }],
        systemPrompt: `You are generating a CSS stylesheet for an animation showcase page in the style of a ${selectedStyle} using the ${selectedColour} colour scheme. Output ONLY raw CSS with no HTML and no JavaScript and no code blocks. Define all colours as CSS custom properties at the top. Include all styles needed for these sections: ${effectsList}. Make it visually stunning and production ready.`,
        model,
        onChunk: chunk => {
          cssContent += chunk
          setMessages(prev => prev.map(m => m.id === tempAssistantId ? { ...m, content: `Generating CSS… (${cssContent.length} chars)` } : m))
        },
      })

      cssContent = stripFences(cssContent)

      // ── Step 2: JavaScript ───────────────────────────────────────
      setShowcaseProgress('Generating JavaScript…')
      setMessages(prev => prev.map(m => m.id === tempAssistantId ? { ...m, content: 'Generating JavaScript…' } : m))
      let jsContent = ''
      await streamAnthropicCall({
        messages:     [{ role: 'user', content: `Generate JavaScript for an animation showcase in the style of a ${selectedStyle}. Implement these effects using CSS class names from the matching stylesheet: ${effectsList}` }],
        systemPrompt: `You are generating JavaScript for an animation showcase page in the style of a ${selectedStyle}. GSAP and ScrollTrigger are already loaded via CDN script tags. tsParticles is already loaded via CDN. Output ONLY raw JavaScript with no HTML and no CSS and no script tags. Implement all of these effects using the CSS class names that would be in a matching stylesheet: ${effectsList}. Wrap everything in a DOMContentLoaded listener. Add null checks before every DOM query.`,
        model,
        onChunk: chunk => {
          jsContent += chunk
          setMessages(prev => prev.map(m => m.id === tempAssistantId ? { ...m, content: `Generating JavaScript… (${jsContent.length} chars)` } : m))
        },
      })

      jsContent = stripFences(jsContent)

      // ── Step 3: HTML ─────────────────────────────────────────────
      setShowcaseProgress('Generating HTML…')
      setMessages(prev => prev.map(m => m.id === tempAssistantId ? { ...m, content: 'Generating HTML…' } : m))
      const htmlMessages = [
        {
          role: 'user',
          content: `Here is the CSS stylesheet that has already been generated for this showcase:\n\n${cssContent}\n\n---\n\nHere is the JavaScript file that has already been generated for this showcase:\n\n${jsContent}\n\n---\n\nNow generate the complete HTML file for an animation showcase in the style of a ${selectedStyle}. Use the exact same class names and IDs from the CSS above, and ensure every interactive element the JavaScript targets exists in the HTML. Create sections for all of these effects: ${effectsList}. Each section should be clearly labelled with the effect name as a heading.`,
        },
      ]
      console.log('[Showcase] Messages sent to HTML generator:', JSON.stringify(htmlMessages, null, 2))
      let htmlContent = ''
      await streamAnthropicCall({
        messages:     htmlMessages,
        systemPrompt: `You are generating the HTML for an animation showcase page in the style of a ${selectedStyle}. Output ONLY the complete HTML file. In the head include a link tag to styles.css, script tags loading GSAP from https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js and ScrollTrigger from https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js and tsParticles from https://cdnjs.cloudflare.com/ajax/libs/tsparticles/2.12.0/tsparticles.bundle.min.js and a script tag linking script.js before the closing body tag. Use the exact class names and IDs from the CSS provided — do not invent new ones. Ensure every element that the JavaScript references exists in the HTML with the correct selector. Each section should be clearly labelled with the effect name as a heading.`,
        model,
        onChunk: chunk => {
          htmlContent += chunk
          setMessages(prev => prev.map(m => m.id === tempAssistantId ? { ...m, content: `Generating HTML… (${htmlContent.length} chars)` } : m))
        },
      })

      htmlContent = stripFences(htmlContent)

      // ── Finalise ─────────────────────────────────────────────────
      const { data: saved } = await supabase
        .from('agent_messages')
        .insert({ agent_key: agentKey, role: 'assistant', content: htmlContent })
        .select('id, created_at')
        .single()

      const finalId = saved?.id ?? tempAssistantId
      setMessages(prev => prev.map(m =>
        m.id === tempAssistantId
          ? { id: finalId, role: 'assistant', content: htmlContent, created_at: saved?.created_at }
          : m
      ))
      setShowcaseFiles(prev => ({ ...prev, [finalId]: { css: cssContent, js: jsContent, html: htmlContent } }))
      setLastShowcaseHtml(htmlContent)

    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === tempAssistantId
          ? { ...m, content: `Error generating showcase: ${err.message}`, streaming: false, error: true }
          : m
      ))
    }

    setStreaming(false)
    setShowcaseProgress('')
    setShowcaseLabel('')
    streamRef.current = ''
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    await sendMessage(text, messages)
  }

  async function handleClearChat() {
    if (!confirm(`Clear all chat history with ${agent?.label}?`)) return
    await supabase.from('agent_messages').delete().eq('agent_key', agentKey)
    setMessages([])
    setLastReport(null)
  }

  if (!agent) return null

  const c = COLOR_CLASSES[agent.color]

  return (
    <div className="flex flex-col -m-6" style={{ height: 'calc(100vh - 4rem)' }}>

      {/* Agent header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/agents" className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <ChevronLeftIcon className="w-4 h-4" />
          </Link>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${c.badge}`}>
            <AgentIcon agentKey={agentKey} className={`w-4 h-4 ${c.icon}`} />
          </div>
          <div>
            <h2 className={`text-sm font-semibold ${c.heading}`}>{agent.label}</h2>
            <p className="text-xs text-zinc-500">{agent.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Download Last Report — SEO Specialist only, shown when a report exists */}
          {agentKey === 'seo-specialist' && lastReport && (
            <button
              onClick={() => generateSeoReportPDF(lastReport.content, lastReport.websiteUrl)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <DownloadIcon className="w-3 h-3" />
              Download Last Report
            </button>
          )}

          <ModelSelector
            value={model}
            onChange={id => {
              setModel(id)
              localStorage.setItem(storageKey(agentKey), id)
            }}
            disabled={streaming}
          />

          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Clear chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-zinc-600">Loading chat…</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${c.badge}`}>
              <AgentIcon agentKey={agentKey} className={`w-6 h-6 ${c.icon}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-300">{agent.label} ready</p>
              <p className="text-xs text-zinc-600 mt-1 max-w-xs">{agent.description}</p>
            </div>
            <p className="text-xs text-zinc-700">Start a conversation below</p>
          </div>
        )}

        {!loading && messages.map((msg, msgIdx) => {
          // Build PDF callback for SEO specialist assistant messages
          const onGeneratePdf =
            agentKey === 'seo-specialist' &&
            msg.role === 'assistant' &&
            !msg.streaming &&
            isSeoContent(msg.content)
              ? () => {
                  let websiteUrl = extractUrlFromText(msg.content)
                  if (!websiteUrl) {
                    for (let i = msgIdx - 1; i >= 0; i--) {
                      const u = extractUrlFromText(messages[i].content)
                      if (u) { websiteUrl = u; break }
                    }
                  }
                  generateSeoReportPDF(msg.content, websiteUrl)
                }
              : null

          const trimmedContent   = msg.content.trimStart()
          const showcaseFileSet  = showcaseFiles[msg.id]
          const isHtmlShowcase   =
            msg.role === 'assistant' &&
            !msg.streaming &&
            (trimmedContent.startsWith('<!DOCTYPE') || trimmedContent.startsWith('<html'))

          return (
            <div key={msg.id} className="space-y-2">
              <ChatMessage
                msg={msg}
                agent={agent}
                c={c}
                onGeneratePdf={onGeneratePdf}
              />
              {showcaseFileSet ? (
                // 3-file showcase — download + preview buttons
                <div className="flex flex-wrap gap-2 pl-11">
                  <button
                    type="button"
                    onClick={() => downloadShowcaseFile('styles.css', showcaseFileSet.css, 'text/css')}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 hover:border-blue-500/50 transition-colors"
                  >
                    Download styles.css
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadShowcaseFile('script.js', showcaseFileSet.js, 'text/javascript')}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 hover:border-blue-500/50 transition-colors"
                  >
                    Download script.js
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadShowcaseFile('index.html', showcaseFileSet.html, 'text/html')}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 hover:border-blue-500/50 transition-colors"
                  >
                    Download index.html
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadShowcaseFile('showcase-preview.html', buildCombinedHtml(showcaseFileSet), 'text/html')}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-violet-500/15 border border-violet-500/30 text-violet-400 hover:bg-violet-500/25 hover:border-violet-500/50 transition-colors"
                  >
                    Download Preview File
                  </button>
                  <button
                    type="button"
                    onClick={() => previewShowcase(showcaseFileSet)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:border-emerald-500/50 transition-colors"
                  >
                    Preview Showcase
                  </button>
                  <button
                    type="button"
                    onClick={generateShowcase}
                    disabled={streaming}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Regenerate with different style
                  </button>
                </div>
              ) : isHtmlShowcase ? (
                // Fallback for single-file HTML responses (old flow or reloaded from DB)
                <div className="flex gap-2 pl-11">
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([msg.content], { type: 'text/html' })
                      window.open(URL.createObjectURL(blob), '_blank')
                    }}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:border-emerald-500/50 transition-colors"
                  >
                    View Showcase
                  </button>
                  <button
                    type="button"
                    onClick={generateShowcase}
                    disabled={streaming}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Regenerate with different style
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900 px-6 py-4 space-y-3">

        {/* Showcase status — Developer only */}
        {agentKey === 'developer' && (showcaseLabel || showcaseProgress) && (
          <div className="space-y-0.5">
            {showcaseLabel   && <p className="text-xs font-medium text-amber-400">{showcaseLabel}</p>}
            {showcaseProgress && <p className="text-xs text-violet-400">{showcaseProgress}</p>}
          </div>
        )}

        {/* Quick actions — SEO Specialist only */}
        {agentKey === 'seo-specialist' && !streaming && (
          <div className="flex flex-wrap gap-1.5">
            {SEO_QUICK_ACTIONS.map(action => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  setInput(action.prompt)
                  setTimeout(() => inputRef.current?.focus(), 0)
                }}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/40 transition-colors"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Quick actions — Developer only */}
        {agentKey === 'developer' && !streaming && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={generateShowcase}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-colors"
            >
              Generate Animation Showcase
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) }
            }}
            placeholder={`Message ${agent.label}…`}
            rows={1}
            disabled={streaming}
            className="flex-1 px-3 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none disabled:opacity-50 leading-relaxed"
            style={{ minHeight: '42px', maxHeight: '160px', overflowY: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              streaming ? 'bg-zinc-800' : 'bg-violet-600 hover:bg-violet-500'
            }`}
          >
            {streaming
              ? <StopIcon className="w-4 h-4 text-zinc-400" />
              : <SendIcon className="w-4 h-4 text-white" />
            }
          </button>
        </form>

        <p className="text-xs text-zinc-700">Enter to send · Shift+Enter for new line</p>

        {agentKey === 'seo-specialist' && (
          <p className="text-xs text-zinc-600">
            This agent also powers the{' '}
            <span className="text-amber-500/70">SEO Audit tool</span>
            {' '}on client profiles.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Model selector ────────────────────────────────────────────────────────────

function ModelSelector({ value, onChange, disabled }) {
  const selected = MODELS.find(m => m.id === value) ?? MODELS[1]

  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="appearance-none pl-3 pr-7 py-1.5 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title={selected.desc}
      >
        {MODELS.map(m => (
          <option key={m.id} value={m.id}>
            {m.label} — {m.desc}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function ChatMessage({ msg, agent, c, onGeneratePdf }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-violet-600 px-4 py-3 text-sm text-white leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    )
  }

  const searches     = msg.searches ?? []
  const activeSearch = searches.find(s => !s.done)
  const doneSearches = searches.filter(s => s.done)
  const hasSearches  = searches.length > 0
  const showDots     = msg.streaming && !msg.content && !activeSearch

  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center border mt-0.5 ${c.badge}`}>
        <AgentIcon agentKey={agent.key} className={`w-3.5 h-3.5 ${c.icon}`} />
      </div>

      <div className="flex-1 space-y-2 min-w-0">
        {/* Web search chips */}
        {hasSearches && (
          <div className="flex flex-wrap gap-1.5">
            {doneSearches.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-zinc-800/60 text-zinc-500 border border-zinc-700/60 max-w-[280px]"
              >
                <WebSearchDoneIcon />
                <span className="truncate">{s.query}</span>
              </span>
            ))}
            {activeSearch && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 max-w-[320px]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                <span className="truncate">Searching: {activeSearch.query}</span>
              </span>
            )}
          </div>
        )}

        {/* Message bubble */}
        {(msg.content || showDots || msg.error) && (
          <div className={`rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            msg.error ? 'bg-red-900/20 border-red-800 text-red-400' : `${c.bubble} text-zinc-200`
          }`}>
            {showDots ? (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            ) : (
              <>
                {msg.content}
                {msg.streaming && msg.content && (
                  <span className="inline-block w-1.5 h-3.5 bg-zinc-400 ml-0.5 animate-pulse align-middle" />
                )}
              </>
            )}
          </div>
        )}

        {/* Waiting bubble when actively searching but no text yet */}
        {!msg.content && !showDots && !msg.error && activeSearch && (
          <div className={`rounded-2xl rounded-tl-sm border px-4 py-3 text-sm ${c.bubble}`}>
            <span className="flex items-center gap-1.5 text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        {/* Generate PDF Report button — SEO analysis messages only */}
        {onGeneratePdf && (
          <button
            onClick={onGeneratePdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800/80 border border-zinc-700/60 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
          >
            <DownloadIcon className="w-3 h-3" />
            Generate PDF Report
          </button>
        )}
      </div>
    </div>
  )
}

// ── Icons & helpers ───────────────────────────────────────────────────────────

function WebSearchDoneIcon() {
  return (
    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function AgentIcon({ agentKey, className }) {
  if (agentKey === 'researcher')     return <SearchIcon className={className} />
  if (agentKey === 'designer')       return <PenIcon className={className} />
  if (agentKey === 'developer')      return <CodeIcon className={className} />
  if (agentKey === 'reviewer')       return <CheckIcon className={className} />
  if (agentKey === 'seo-specialist') return <TrendingUpIcon className={className} />
  return null
}

function SearchIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>
}
function PenIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
}
function CodeIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline strokeLinecap="round" strokeLinejoin="round" points="16 18 22 12 16 6" /><polyline strokeLinecap="round" strokeLinejoin="round" points="8 6 2 12 8 18" /></svg>
}
function CheckIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
}
function SendIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" /></svg>
}
function StopIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
}
function ChevronLeftIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
}
function TrendingUpIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline strokeLinecap="round" strokeLinejoin="round" points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline strokeLinecap="round" strokeLinejoin="round" points="17 6 23 6 23 12" /></svg>
}
function ChevronDownIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
}
function DownloadIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4" /></svg>
}
