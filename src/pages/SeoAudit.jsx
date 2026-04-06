import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { supabase } from '../lib/supabase'
import { streamAnthropicCall } from '../lib/streamHelper'
import { SEO_SPECIALIST_SYSTEM } from '../lib/agents'
import { useToast } from '../context/ToastContext'

// ── Audit user message template ───────────────────────────────────────────────

function buildAuditMessage(websiteUrl) {
  return `Please conduct a comprehensive SEO audit of this website: ${websiteUrl}. Use web search to fetch and analyse the homepage, robots.txt and sitemap.xml. Then produce a complete professional SEO audit report structured as follows: Executive Summary (2-3 sentences overall assessment), Overall SEO Score out of 100, then six sections each with a traffic light status of Good, Needs Work or Critical: 1) Page Titles and Descriptions — check presence, length (50-60 chars for title, 150-160 for description) and keyword usage, show actual examples from the site, 2) Website Structure and Headings — check H1 H2 H3 hierarchy, proper use across pages, 3) Images and Visual Content — check alt text presence and quality, image file sizes if detectable, 4) Mobile Friendliness — assess mobile optimisation signals, viewport meta tag, responsive design indicators, 5) Page Speed and Technical Health — check HTTPS, robots.txt, sitemap, canonical tags, schema markup, Core Web Vitals signals, 6) Content and Keywords — assess content quality depth and keyword targeting, identify gaps and opportunities. End with Recommended Actions listing the top 5 highest impact improvements in priority order written in plain English with expected business benefit for each. Close with a short paragraph explaining how these issues affect the business bottom line. Write everything in plain English a non-technical business owner can understand. Be specific — reference actual content found on the site.`
}

// ── Progress stages ───────────────────────────────────────────────────────────

const PROGRESS_STAGES = [
  'Preparing audit…',
  'Fetching homepage…',
  'Checking robots.txt…',
  'Checking sitemap…',
  'Generating report…',
]

// ── Traffic light badge ───────────────────────────────────────────────────────

function TrafficLightBadge({ status }) {
  const config = {
    Good:         { cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400' },
    'Needs Work': { cls: 'bg-amber-500/20   text-amber-300   border-amber-500/40',   dot: 'bg-amber-400'   },
    Critical:     { cls: 'bg-red-500/20     text-red-300     border-red-500/40',     dot: 'bg-red-400'     },
  }
  const { cls, dot } = config[status] ?? config['Needs Work']
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {status}
    </span>
  )
}

// ── Inline markdown renderer ──────────────────────────────────────────────────

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2)
      if (inner === 'Good' || inner === 'Needs Work' || inner === 'Critical') {
        return <TrafficLightBadge key={i} status={inner} />
      }
      return <strong key={i} className="text-white font-semibold">{inner}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} className="italic text-zinc-300">{part.slice(1, -1)}</em>
    }
    return <span key={i}>{part}</span>
  })
}

function extractTrafficLight(text) {
  const match = text.match(/\s+[—–\-]\s+(Good|Needs Work|Critical)\s*$/)
  if (match) return { cleanText: text.slice(0, match.index).trim(), badge: match[1] }
  const match2 = text.match(/:\s+(Good|Needs Work|Critical)\s*$/)
  if (match2) return { cleanText: text.slice(0, match2.index + 1).trim(), badge: match2[1] }
  return { cleanText: text, badge: null }
}

function MarkdownReport({ content }) {
  if (!content) return null
  const lines = content.split('\n')
  const elements = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('## ')) {
      const { cleanText, badge } = extractTrafficLight(line.slice(3))
      elements.push(
        <h2 key={i} className="text-lg font-bold text-white mt-8 mb-3 flex items-center gap-3 flex-wrap border-b border-zinc-800 pb-2">
          {renderInline(cleanText)}
          {badge && <TrafficLightBadge status={badge} />}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      const { cleanText, badge } = extractTrafficLight(line.slice(4))
      elements.push(
        <h3 key={i} className="text-base font-semibold text-zinc-200 mt-5 mb-2 flex items-center gap-2 flex-wrap">
          {renderInline(cleanText)}
          {badge && <TrafficLightBadge status={badge} />}
        </h3>
      )
    } else if (line.startsWith('# ')) {
      const { cleanText, badge } = extractTrafficLight(line.slice(2))
      elements.push(
        <h1 key={i} className="text-2xl font-bold text-white mt-6 mb-3 flex items-center gap-3 flex-wrap">
          {renderInline(cleanText)}
          {badge && <TrafficLightBadge status={badge} />}
        </h1>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-2 mb-1.5 ml-4">
          <span className="text-zinc-500 mt-1.5 flex-shrink-0 text-xs">•</span>
          <p className="text-sm text-zinc-300 leading-relaxed">{renderInline(line.slice(2))}</p>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const m = line.match(/^(\d+)\.\s(.*)/)
      if (m) {
        elements.push(
          <div key={i} className="flex items-start gap-2 mb-1.5 ml-4">
            <span className="text-amber-400 font-bold text-sm mt-0.5 flex-shrink-0 w-5">{m[1]}.</span>
            <p className="text-sm text-zinc-300 leading-relaxed">{renderInline(m[2])}</p>
          </div>
        )
      }
    } else if (line.trim() === '---') {
      elements.push(<hr key={i} className="border-zinc-800 my-5" />)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    } else {
      const statusOnly = line.match(/^\*\*(Good|Needs Work|Critical)\*\*$/)
      if (statusOnly) {
        elements.push(<div key={i} className="mb-3"><TrafficLightBadge status={statusOnly[1]} /></div>)
      } else {
        elements.push(
          <p key={i} className="text-sm text-zinc-300 leading-relaxed mb-2">
            {renderInline(line)}
          </p>
        )
      }
    }
  }

  return <div>{elements}</div>
}

// ── PDF generation ────────────────────────────────────────────────────────────

function generatePdf({ clientName, websiteUrl, reportContent, date }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const usable = pageW - margin * 2
  let y = margin

  function checkPage(needed = 7) {
    if (y + needed > pageH - margin - 10) { doc.addPage(); y = margin }
  }

  function drawText(text, opts = {}) {
    const { size = 10, bold = false, color = [60, 60, 60], indent = 0, lineH } = opts
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    const wrapped = doc.splitTextToSize(text, usable - indent)
    const lh = lineH ?? size * 0.44
    for (const ln of wrapped) { checkPage(); doc.text(ln, margin + indent, y); y += lh }
  }

  function drawBadge(status, xPos, yPos) {
    const palettes = { Good: [16, 185, 129], 'Needs Work': [245, 158, 11], Critical: [239, 68, 68] }
    const [r, g, b] = palettes[status] ?? palettes['Needs Work']
    const w = status === 'Needs Work' ? 24 : 15
    doc.setFillColor(r, g, b)
    doc.roundedRect(xPos, yPos - 3.5, w, 5.5, 1.5, 1.5, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    doc.text(status, xPos + 2, yPos)
  }

  // Header accent bar
  doc.setFillColor(245, 158, 11)
  doc.rect(0, 0, pageW, 2, 'F')

  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
  doc.text('Forge Agency', margin, y + 4); y += 8
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130)
  doc.text('SEO Audit Report — Senior SEO Specialist', margin, y); y += 7
  doc.setDrawColor(220, 220, 220); doc.line(margin, y, pageW - margin, y); y += 7

  drawText(`Client: ${clientName}`, { size: 12, bold: true, color: [30, 30, 30] }); y += 1
  drawText(`Website: ${websiteUrl}`, { size: 10, color: [80, 80, 80] }); y += 1
  drawText(`Date of Audit: ${date}`, { size: 10, color: [130, 130, 130] }); y += 8

  const lines = reportContent.split('\n')
  let listNum = 0

  for (const line of lines) {
    if (line.startsWith('## ')) {
      y += 4; checkPage(12)
      const text = line.slice(3)
      const statusMatch = text.match(/\s+[—–\-]\s+(Good|Needs Work|Critical)\s*$/)
      const cleanText = statusMatch ? text.slice(0, statusMatch.index).trim() : text.replace(/\*\*/g, '')
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
      const wrapped = doc.splitTextToSize(cleanText, usable - (statusMatch ? 30 : 0))
      for (const wl of wrapped) { checkPage(); doc.text(wl, margin, y); y += 6 }
      if (statusMatch) { drawBadge(statusMatch[1], margin, y - 2); y += 3 }
      doc.setDrawColor(210, 210, 210); doc.line(margin, y, pageW - margin, y); y += 4
      listNum = 0
    } else if (line.startsWith('### ')) {
      y += 2; checkPage(8)
      drawText(line.slice(4).replace(/\*\*([^*]+)\*\*/g, '$1'), { size: 11, bold: true, color: [50, 50, 50], lineH: 5 })
      y += 1; listNum = 0
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      checkPage()
      drawText('• ' + line.slice(2).replace(/\*\*([^*]+)\*\*/g, '$1'), { size: 10, indent: 5, color: [60, 60, 60], lineH: 4.5 })
    } else if (/^\d+\.\s/.test(line)) {
      checkPage(); listNum++
      drawText(listNum + '. ' + line.replace(/^\d+\.\s/, '').replace(/\*\*([^*]+)\*\*/g, '$1'), { size: 10, indent: 5, color: [60, 60, 60], lineH: 4.5 })
    } else if (line.trim() === '---') {
      checkPage(6); doc.setDrawColor(220, 220, 220); doc.line(margin, y, pageW - margin, y); y += 5
    } else if (line.trim() === '') {
      y += 3; listNum = 0
    } else {
      checkPage()
      drawText(line.replace(/\*\*([^*]+)\*\*/g, '$1'), { size: 10, color: [60, 60, 60], lineH: 4.5 })
    }
  }

  y += 10; checkPage(10)
  doc.setDrawColor(220, 220, 220); doc.line(margin, y, pageW - margin, y); y += 5
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150)
  doc.text(`Prepared by Forge Agency · ${date}`, margin, y)

  const slug = clientName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  doc.save(`${slug}-seo-audit-${new Date().toISOString().slice(0, 10)}.pdf`)
}

// ── Progress indicator ────────────────────────────────────────────────────────

function ProgressIndicator({ stage }) {
  const steps = PROGRESS_STAGES.slice(1) // skip 'Preparing…'
  const stageIndex = PROGRESS_STAGES.indexOf(stage)

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-8">
      <div className="relative w-16 h-16">
        <div className="w-16 h-16 border-2 border-amber-500/30 rounded-full" />
        <div className="absolute inset-0 w-16 h-16 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <SearchIcon className="w-6 h-6 text-amber-400" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-zinc-200">{stage}</p>
        <p className="text-xs text-zinc-600">Analysing with Senior SEO Specialist</p>
      </div>

      <div className="flex items-center gap-3">
        {steps.map((step, i) => {
          const stepIndex = i + 1
          const isDone    = stageIndex > stepIndex
          const isActive  = stageIndex === stepIndex
          return (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
                isDone    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                isActive  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                            'bg-zinc-800/50 text-zinc-600 border border-zinc-800'
              }`}>
                {isDone && <CheckIcon className="w-3 h-3" />}
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                <span>{step.replace('…', '')}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-4 h-px ${isDone ? 'bg-emerald-500/40' : 'bg-zinc-800'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SeoAudit() {
  const { clientId } = useParams()
  const [searchParams] = useSearchParams()
  const showToast = useToast()

  const [client,    setClient]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [phase,     setPhase]     = useState('idle')   // idle | running | streaming | done | error
  const [progress,  setProgress]  = useState(PROGRESS_STAGES[0])
  const [report,    setReport]    = useState('')
  const [score,     setScore]     = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [savedDate, setSavedDate] = useState(null)
  const [errorMsg,  setErrorMsg]  = useState('')
  const reportRef  = useRef(null)
  const phaseRef   = useRef('idle')
  const toolCount  = useRef(0)

  const auditId = searchParams.get('audit')

  useEffect(() => {
    async function load() {
      const { data: clientData } = await supabase
        .from('clients').select('*').eq('id', clientId).single()
      setClient(clientData)

      if (auditId) {
        const { data: auditData } = await supabase
          .from('seo_audits').select('*').eq('id', auditId).single()
        if (auditData) {
          setReport(auditData.report_content ?? '')
          setScore(auditData.score ?? null)
          setSaved(true)
          setSavedDate(new Date(auditData.created_at).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          }))
          phaseRef.current = 'done'
          setPhase('done')
        }
      }
      setLoading(false)
    }
    load()
  }, [clientId, auditId])

  // Auto-scroll during streaming
  useEffect(() => {
    if (phase === 'streaming' && reportRef.current) {
      reportRef.current.scrollTop = reportRef.current.scrollHeight
    }
  }, [report, phase])

  function advanceProgress() {
    toolCount.current += 1
    const n = toolCount.current
    if (n === 1) setProgress(PROGRESS_STAGES[1])       // Fetching homepage
    else if (n === 2) setProgress(PROGRESS_STAGES[2])  // Checking robots.txt
    else if (n === 3) setProgress(PROGRESS_STAGES[3])  // Checking sitemap
    else setProgress(PROGRESS_STAGES[4])               // Generating report
  }

  async function handleRunAudit() {
    if (!client?.website) return
    setPhase('running')
    phaseRef.current = 'running'
    setProgress(PROGRESS_STAGES[0])
    toolCount.current = 0
    setReport('')
    setScore(null)
    setSaved(false)
    setSavedDate(null)
    setErrorMsg('')

    const userMessage = buildAuditMessage(client.website)

    try {
      await streamAnthropicCall({
        messages:     [{ role: 'user', content: userMessage }],
        systemPrompt: SEO_SPECIALIST_SYSTEM,
        model:        'claude-sonnet-4-20250514',
        maxTokens:    30000,
        tools:        [{ type: 'web_search_20250305', name: 'web_search' }],
        extraHeaders: { 'anthropic-beta': 'web-search-2025-03-05' },
        onToolUse: () => advanceProgress(),
        onChunk: chunk => {
          if (phaseRef.current !== 'streaming') {
            phaseRef.current = 'streaming'
            setPhase('streaming')
            setProgress(PROGRESS_STAGES[4])
          }
          setReport(prev => prev + chunk)
        },
        onComplete: text => {
          setReport(text)
          const m = text.match(/\b([1-9][0-9]?|100)\s*(?:\/|out of)\s*100\b/i)
          if (m) setScore(parseInt(m[1]))
          phaseRef.current = 'done'
          setPhase('done')
        },
      })
    } catch (err) {
      console.error('SEO audit error:', err)
      setErrorMsg(err.message)
      phaseRef.current = 'error'
      setPhase('error')
    }
  }

  async function handleSave() {
    if (!report || saving || saved) return
    setSaving(true)

    const extractedScore = score ?? (() => {
      const m = report.match(/\b([1-9][0-9]?|100)\s*(?:\/|out of)\s*100\b/i)
      return m ? parseInt(m[1]) : null
    })()

    const { error: insertError } = await supabase.from('seo_audits').insert({
      client_id:      clientId,
      website_url:    client.website,
      report_content: report,
      score:          extractedScore,
    })

    if (insertError) {
      showToast('Failed to save audit: ' + insertError.message, 'error')
      setSaving(false)
      return
    }

    await supabase.from('agent_messages').insert({
      agent_key: 'seo-specialist',
      role:      'user',
      content:   `SEO audit completed for ${client.name} — ${client.website}`,
    })

    setSaved(true)
    setSaving(false)
    showToast('Audit saved to client profile', 'success')
  }

  function handleDownloadPdf() {
    if (!report) return
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    generatePdf({ clientName: client.name, websiteUrl: client.website, reportContent: report, date })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400">
        Client not found.
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* Back link */}
      <Link
        to={`/clients/${clientId}`}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ChevronLeftIcon className="w-3.5 h-3.5" />
        Back to {client.name}
      </Link>

      {/* Header card */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <TrendingUpIcon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">SEO Audit</h1>
              <p className="text-xs text-amber-400/80">Senior SEO Specialist</p>
            </div>
          </div>
          <Link
            to="/agents/seo-specialist"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-amber-600/40 text-amber-500/80 hover:text-amber-400 hover:border-amber-600/70 transition-colors"
          >
            <TrendingUpIcon className="w-3 h-3" />
            Open chat
          </Link>
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-zinc-300">{client.name}</p>
          <a
            href={client.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            {client.website}
          </a>
        </div>
        {savedDate && (
          <p className="text-xs text-zinc-500">Saved audit from {savedDate}</p>
        )}
      </div>

      {/* ── Idle: Run button ── */}
      {phase === 'idle' && (
        <div className="flex flex-col items-center justify-center py-20 gap-6">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
            <TrendingUpIcon className="w-10 h-10 text-amber-400" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-lg font-semibold text-white">Ready to analyse</h2>
            <p className="text-sm text-zinc-500 max-w-sm">
              The Senior SEO Specialist will search and analyse <span className="text-zinc-300">{client.website}</span>, check robots.txt and sitemap, then produce a full audit with actionable recommendations.
            </p>
          </div>
          <button
            onClick={handleRunAudit}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors shadow-lg shadow-amber-900/20"
          >
            <TrendingUpIcon className="w-4 h-4" />
            Run SEO Audit
          </button>
        </div>
      )}

      {/* ── Running: progress indicators ── */}
      {phase === 'running' && <ProgressIndicator stage={progress} />}

      {/* ── Error ── */}
      {phase === 'error' && (
        <div className="rounded-xl bg-red-900/20 border border-red-800 p-6 space-y-3">
          <p className="text-sm font-semibold text-red-400">Audit failed</p>
          <p className="text-xs text-red-300/70 font-mono">{errorMsg}</p>
          <button
            onClick={() => { setPhase('idle'); phaseRef.current = 'idle' }}
            className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Report (streaming or done) ── */}
      {(phase === 'streaming' || phase === 'done') && (
        <div className="space-y-4">

          {/* Score ring — shown once extracted */}
          {score !== null && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 flex items-center gap-5">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 border-2 font-bold text-xl ${
                score >= 70 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : score >= 50 ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                  : 'bg-red-500/10 border-red-500/40 text-red-400'
              }`}>
                {score}
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Overall SEO Score</p>
                <p className="text-base font-semibold text-zinc-200">
                  {score >= 70 ? 'Good foundation — some improvements recommended'
                    : score >= 50 ? 'Needs improvement — several issues to address'
                    : 'Critical issues — urgent action required'}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">out of 100</p>
              </div>
            </div>
          )}

          {/* Report */}
          <div ref={reportRef} className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <MarkdownReport content={report} />
            {phase === 'streaming' && (
              <span className="inline-block w-2 h-4 bg-amber-400 animate-pulse ml-0.5 align-middle" />
            )}
          </div>

          {/* Actions */}
          {phase === 'done' && (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleDownloadPdf}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Download PDF
              </button>
              {!saved ? (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save to Client Profile'}
                </button>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-emerald-400 font-medium">
                  <CheckIcon className="w-4 h-4" />
                  Saved to client profile
                </span>
              )}
              {!saved && (
                <button
                  onClick={() => { setPhase('idle'); phaseRef.current = 'idle'; setReport(''); setScore(null) }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                  Run again
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronLeftIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function TrendingUpIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline strokeLinecap="round" strokeLinejoin="round" points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline strokeLinecap="round" strokeLinejoin="round" points="17 6 23 6 23 12" />
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
    </svg>
  )
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function RefreshIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}
