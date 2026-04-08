import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { supabase } from '../lib/supabase'
import { safeUpdate } from '../lib/supabaseHelpers'
import { useUI } from '../context/UIContext'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'


// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active:            { dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Active'           },
  lead:              { dot: 'bg-amber-400',   badge: 'bg-amber-500/15   text-amber-400   border-amber-500/30',   label: 'Lead'             },
  'needs attention': { dot: 'bg-amber-400',   badge: 'bg-amber-500/15   text-amber-400   border-amber-500/30',   label: 'Needs attention'  },
  inactive:          { dot: 'bg-zinc-500',    badge: 'bg-zinc-700/40    text-zinc-400    border-zinc-700',        label: 'Inactive'         },
}

const STAGE_CONFIG = {
  'Not Started': { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30'     },
  Research:      { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  Design:        { bg: 'bg-violet-500/15',  text: 'text-violet-400',  border: 'border-violet-500/30'  },
  Dev:           { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30'  },
  Review:        { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
  Delivered:     { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

// Build the ordered files list for a project — static entries + dynamic wireframes + dynamic HTML pages
function buildProjectFiles(project, outputs) {
  const files = []

  function addStatic(agentName, label, ext, field) {
    const record = outputs.find(o => o.agent_name === agentName)
    if (!record) return
    const content = record[field]
    if (!content?.trim()) return
    files.push({ agentName, label, ext, field, content, date: formatDate(record.created_at), record })
  }

  // 1. Orchestrator Report
  addStatic('Orchestrator', 'Orchestrator Report', 'pdf', 'output_text')

  // 2. Researcher Report
  addStatic('researcher', 'Researcher Report', 'pdf', 'output_text')

  // 3. Design Brief
  addStatic('designer', 'Design Brief', 'pdf', 'output_text')

  // 4. Wireframes — deduplicate by agent_name (most recent), sorted by project.pages order
  const wireframeMap = outputs
    .filter(o => o.agent_name.startsWith('Designer-Wireframe-'))
    .reduce((map, o) => {
      const existing = map.get(o.agent_name)
      if (!existing || new Date(o.created_at) > new Date(existing.created_at)) map.set(o.agent_name, o)
      return map
    }, new Map())
  const pageOrder = project.pages ?? []
  const wireframeRecords = Array.from(wireframeMap.values()).sort((a, b) => {
    const aFile = a.agent_name.replace('Designer-Wireframe-', '')
    const bFile = b.agent_name.replace('Designer-Wireframe-', '')
    const aIdx = pageOrder.findIndex(p => p.filename === aFile)
    const bIdx = pageOrder.findIndex(p => p.filename === bFile)
    if (aIdx === -1 && bIdx === -1) return 0
    if (aIdx === -1) return 1
    if (bIdx === -1) return -1
    return aIdx - bIdx
  })
  for (const record of wireframeRecords) {
    const content = record.output_wireframe
    if (!content?.trim()) continue
    const pageFilename = record.agent_name.replace('Designer-Wireframe-', '')
    const pageInfo     = pageOrder.find(p => p.filename === pageFilename)
    const pageName     = pageInfo?.name ?? pageFilename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    files.push({ agentName: record.agent_name, label: `Wireframe — ${pageName}`, ext: 'svg', field: 'output_wireframe', pageFilename, content, date: formatDate(record.created_at), record })
  }

  // 5. Homepage HTML — prefer multi-page index record, fall back to legacy Developer-HTML
  const homepageRecord = outputs.find(o => o.agent_name === 'Developer-HTML-index.html')
    ?? outputs.find(o => o.agent_name === 'Developer-HTML')
  if (homepageRecord?.output_text?.trim()) {
    files.push({ agentName: homepageRecord.agent_name, label: 'Homepage HTML', ext: 'html', field: 'output_text', pageFilename: 'index.html', content: homepageRecord.output_text, date: formatDate(homepageRecord.created_at), record: homepageRecord })
  }

  // 6. Stylesheet
  addStatic('Developer-CSS', 'Stylesheet', 'css', 'output_text')

  // 7. JavaScript
  addStatic('Developer-JS', 'JavaScript', 'js', 'output_text')

  // 8. Additional HTML pages (Developer-HTML-* except index, deduplicated, page order)
  const usedHomepageAgentName = homepageRecord?.agent_name
  const additionalHtmlMap = outputs
    .filter(o => o.agent_name.startsWith('Developer-HTML-') && o.agent_name !== 'Developer-HTML-index.html' && o.agent_name !== usedHomepageAgentName)
    .reduce((map, o) => {
      const existing = map.get(o.agent_name)
      if (!existing || new Date(o.created_at) > new Date(existing.created_at)) map.set(o.agent_name, o)
      return map
    }, new Map())
  const additionalHtmlRecords = Array.from(additionalHtmlMap.values()).sort((a, b) => {
    const aFile = a.agent_name.replace('Developer-HTML-', '')
    const bFile = b.agent_name.replace('Developer-HTML-', '')
    const aIdx = pageOrder.findIndex(p => p.filename === aFile)
    const bIdx = pageOrder.findIndex(p => p.filename === bFile)
    if (aIdx === -1 && bIdx === -1) return 0
    if (aIdx === -1) return 1
    if (bIdx === -1) return -1
    return aIdx - bIdx
  })
  for (const record of additionalHtmlRecords) {
    const content = record.output_text
    if (!content?.trim()) continue
    const pageFilename = record.agent_name.replace('Developer-HTML-', '')
    const pageInfo     = pageOrder.find(p => p.filename === pageFilename)
    const pageName     = pageInfo?.name ?? pageFilename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    files.push({ agentName: record.agent_name, label: `${pageName} HTML`, ext: 'html', field: 'output_text', pageFilename, content, date: formatDate(record.created_at), record })
  }

  // 9. Developer Pages Guide
  addStatic('Developer-Pages', 'Developer Pages Guide', 'pdf', 'output_text')

  // 10. Reviewer Report
  addStatic('reviewer', 'Reviewer Report', 'pdf', 'output_text')

  return files
}

// ── PDF export (copied from ProjectDetail) ────────────────────────────────────

function downloadPdf({ agentName, projectName, clientName, date, bodyText, filename }) {
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const pageW  = doc.internal.pageSize.getWidth()
  const pageH  = doc.internal.pageSize.getHeight()
  const usable = pageW - margin * 2
  let y = margin

  function checkPage(needed = 7) {
    if (y + needed > pageH - margin - 10) { doc.addPage(); y = margin }
  }

  function drawText(text, opts = {}) {
    const { size = 11, bold = false, color = [60, 60, 60], indent = 0 } = opts
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, usable - indent)
    for (const line of lines) { checkPage(); doc.text(line, margin + indent, y); y += size * 0.45 }
  }

  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30)
  doc.text('Forge Agency', margin, y); y += 7
  doc.setDrawColor(180, 180, 180); doc.line(margin, y, pageW - margin, y); y += 6
  drawText(`Project: ${projectName}`, { size: 14, color: [40, 40, 40] }); y += 1
  drawText(`Client: ${clientName}`,  { size: 14, color: [40, 40, 40] }); y += 5
  drawText(agentName, { size: 14, bold: true, color: [30, 30, 30] }); y += 1
  drawText(`Generated: ${date}`, { size: 10, color: [130, 130, 130] }); y += 6

  const lines = (bodyText ?? '').split('\n')
  let listCounter = 0
  for (const line of lines) {
    if (/^\s*---\s*$/.test(line)) { checkPage(5); doc.setDrawColor(200,200,200); doc.line(margin,y,pageW-margin,y); y+=5; continue }
    if (/^##\s/.test(line))  { y+=3; checkPage(8); drawText(line.replace(/^##\s+/,'').replace(/\*\*/g,''),{size:16,bold:true,color:[50,50,50]}); y+=2; listCounter=0; continue }
    if (/^###\s/.test(line)) { y+=2; checkPage(6); drawText(line.replace(/^###\s+/,'').replace(/\*\*/g,''),{size:14,bold:true,color:[70,70,70]}); y+=1; listCounter=0; continue }
    if (/^-\s/.test(line))   { checkPage(); drawText('• '+line.replace(/^-\s+/,'').replace(/\*\*([^*]+)\*\*/g,'$1'),{size:11,indent:5,color:[60,60,60]}); continue }
    if (/^\d+\.\s/.test(line)) { listCounter++; checkPage(); drawText(`${listCounter}. `+line.replace(/^\d+\.\s+/,'').replace(/\*\*([^*]+)\*\*/g,'$1'),{size:11,indent:5,color:[60,60,60]}); continue }
    if (line.trim()==='') { y+=3; listCounter=0; continue }
    checkPage(); drawText(line.replace(/\*\*([^*]+)\*\*/g,'$1'),{size:11,color:[60,60,60]})
  }

  y+=10; checkPage(8); doc.setDrawColor(220,220,220); doc.line(margin,y,pageW-margin,y); y+=5
  drawText(`Generated by Forge Agency AI Pipeline · ${date}`,{size:9,color:[160,160,160]})
  doc.save(filename)
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientDetail() {
  const { clientId }  = useParams()
  const navigate      = useNavigate()
  const { setNewProjectOpen, lastCreatedProject } = useUI()
  const confirm       = useConfirm()

  const [client,         setClient]         = useState(null)
  const [projects,       setProjects]       = useState([])
  const [agentOutputs,   setAgentOutputs]   = useState([])
  const [lastAudit,      setLastAudit]      = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [editOpen,       setEditOpen]       = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const [openProjects,   setOpenProjects]   = useState({})  // projectId → bool for collapsible sections
  const [newProjectIds,  setNewProjectIds]  = useState(() => new Set())
  const processedProjectRef = useRef(null)

  useEffect(() => {
    load()

    const ch = supabase
      .channel(`client-detail-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients',       filter: `id=eq.${clientId}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `client_id=eq.${clientId}` }, load)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'projects', filter: `client_id=eq.${clientId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefs',        filter: `client_id=eq.${clientId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_outputs' }, load)
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [clientId])

  // Immediate optimistic update when a new project is created via the panel
  useEffect(() => {
    if (!lastCreatedProject) return
    if (lastCreatedProject.id === processedProjectRef.current) return
    if (lastCreatedProject.client_id !== clientId) return
    processedProjectRef.current = lastCreatedProject.id
    setProjects(prev => {
      if (prev.some(p => p.id === lastCreatedProject.id)) return prev
      return [lastCreatedProject, ...prev]
    })
    setNewProjectIds(prev => new Set([...prev, lastCreatedProject.id]))
  }, [lastCreatedProject, clientId])

  async function load() {
    const [clientRes, projectsRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).single(),
      supabase.from('projects').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ])

    if (clientRes.error) { setError(clientRes.error.message); setLoading(false); return }
    setClient(clientRes.data)

    const projs = projectsRes.data ?? []
    setProjects(projs)

    if (projs.length > 0) {
      const { data: outputs } = await supabase
        .from('agent_outputs')
        .select('*')
        .in('project_id', projs.map(p => p.id))
        .order('created_at', { ascending: true })
      setAgentOutputs(outputs ?? [])
    } else {
      setAgentOutputs([])
    }

    // Load most recent SEO audit (table may not exist yet — ignore errors)
    try {
      console.log('[seo_audits] ClientDetail list query — select: "id, client_id, website_url, score, created_at", filter: client_id =', clientId, ', order: created_at desc, limit: 1')
      const { data: auditData } = await supabase
        .from('seo_audits')
        .select('id, client_id, website_url, score, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setLastAudit(auditData ?? null)
    } catch {
      setLastAudit(null)
    }

    setLoading(false)
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete ${client?.name}?`,
      message: 'This will permanently delete the client record. This cannot be undone.',
      confirmLabel: 'Delete client',
      variant: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    await supabase.from('clients').delete().eq('id', clientId)
    navigate('/clients')
  }

  function handleUpdated(updated) {
    setClient(updated)
    setEditOpen(false)
  }

  function toggleProject(pid) {
    setOpenProjects(prev => ({ ...prev, [pid]: !prev[pid] }))
  }

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-zinc-800" />
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 space-y-3">
        <div className="h-5 w-1/3 rounded bg-zinc-800" />
        <div className="h-4 w-1/2 rounded bg-zinc-800" />
      </div>
    </div>
  )

  if (error) return (
    <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400">
      {error}
    </div>
  )

  const status      = STATUS_CONFIG[client.status] ?? STATUS_CONFIG.inactive
  const activeCount = projects.filter(p => p.status === 'active').length

  // Build files list per project
  const filesByProject = projects.map(project => {
    const outputs = agentOutputs.filter(o => o.project_id === project.id)
    const files = buildProjectFiles(project, outputs)
    return { project, files }
  }).filter(g => g.files.length > 0)

  return (
    <>
      <div className="space-y-8">
        {/* ── Back ── */}
        <div>
          <Link
            to="/clients"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeftIcon className="w-3.5 h-3.5" />
            All clients
          </Link>
        </div>

        {/* ── Header card ── */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <div className="flex items-start justify-between gap-4">
            {/* Left: name + info */}
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white">{client.name}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${status.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {client.email && (
                  <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                    <MailIcon className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                    <a href={`mailto:${client.email}`} className="hover:text-zinc-200 transition-colors">{client.email}</a>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                    <PhoneIcon className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {client.website && (
                  <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                    <GlobeIcon className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-zinc-200 transition-colors"
                    >
                      {client.website}
                    </a>
                  </div>
                )}
              </div>

              {client.website && (
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => navigate(`/seo-audit/${clientId}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-amber-600/60 text-amber-400 hover:bg-amber-950/40 transition-colors"
                  >
                    <SearchIcon className="w-3.5 h-3.5" />
                    SEO Audit
                  </button>
                  {lastAudit && (
                    <Link
                      to={`/seo-audit/${clientId}?audit=${lastAudit.id}`}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
                    >
                      View last audit · {formatDate(lastAudit.created_at)}
                      {lastAudit.score != null && ` · Score: ${lastAudit.score}/100`}
                    </Link>
                  )}
                </div>
              )}

              {client.notes && (
                <p className="text-sm text-zinc-500 whitespace-pre-wrap max-w-2xl">{client.notes}</p>
              )}
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setEditOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                <PencilIcon className="w-3.5 h-3.5" />
                Edit client
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-red-800/60 text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-50"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Projects section ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Projects</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {projects.length === 0
                  ? 'No projects yet'
                  : `${activeCount} active · ${projects.length} total`}
              </p>
            </div>
            <button
              onClick={() => setNewProjectOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New project
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-12 flex flex-col items-center gap-3">
              <p className="text-sm text-zinc-500">No projects for this client yet</p>
              <button
                onClick={() => setNewProjectOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                New project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isNew={newProjectIds.has(project.id)}
                  onDeleted={id => setProjects(prev => prev.filter(p => p.id !== id))}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Files section ── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Files</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Agent-generated outputs across all projects</p>
          </div>

          {filesByProject.length === 0 ? (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-10 flex items-center justify-center">
              <p className="text-sm text-zinc-600">No files generated yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filesByProject.map(({ project, files }) => {
                const isOpen = openProjects[project.id] !== false  // default open
                return (
                  <div key={project.id} className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
                    {/* Project heading */}
                    <button
                      onClick={() => toggleProject(project.id)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-zinc-200 truncate">{project.name}</span>
                        <span className="text-xs text-zinc-600 flex-shrink-0">{files.length} file{files.length !== 1 ? 's' : ''}</span>
                      </div>
                      <ChevronDownIcon className={`w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    </button>

                    {/* File rows */}
                    {isOpen && (
                      <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
                        {files.map(file => (
                          <FileRow
                            key={`${project.id}-${file.agentName}`}
                            file={file}
                            project={project}
                            client={client}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Edit panel ── */}
      <EditClientPanel
        client={client}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onUpdated={handleUpdated}
      />
    </>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, isNew = false, onDeleted }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [visible,  setVisible]  = useState(!isNew)
  const menuRef   = useRef(null)
  const confirm   = useConfirm()
  const showToast = useToast()

  const stageCfg  = STAGE_CONFIG[project.current_stage]
  const createdAt = project.created_at
    ? new Date(project.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  // Trigger fade+slide-in on first render when isNew
  useEffect(() => {
    if (!isNew) return
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [isNew])

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  async function handleDelete() {
    setMenuOpen(false)
    const ok = await confirm({
      title: 'Delete Project',
      message: `Deleting this project will permanently remove all agent outputs, wireframes, revisions and files associated with it. This cannot be undone. Are you sure you want to delete ${project.name}?`,
      confirmLabel: 'Delete Project',
      variant: 'danger',
    })
    if (!ok) return
    await supabase.from('agent_output_revisions').delete().eq('project_id', project.id)
    await supabase.from('agent_outputs').delete().eq('project_id', project.id)
    await supabase.from('projects').delete().eq('id', project.id)
    showToast('Project deleted successfully')
    onDeleted(project.id)
  }

  return (
    <div className={`rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 flex flex-col transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
      <div className="p-5 flex flex-col gap-3 flex-1">
        <h3 className="text-sm font-semibold text-white">{project.name}</h3>
        <div className="flex items-center justify-between gap-2 mt-auto">
          {stageCfg ? (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${stageCfg.bg} ${stageCfg.text} ${stageCfg.border}`}>
              {project.current_stage}
            </span>
          ) : (
            <span className="text-xs text-zinc-600">No stage</span>
          )}
          <span className="text-xs text-zinc-600">{createdAt}</span>
        </div>
      </div>
      <div className="border-t border-zinc-800 px-4 py-2.5 flex items-center gap-2">
        <Link
          to={`/projects/${project.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowRightIcon className="w-3.5 h-3.5" />
          View project
        </Link>

        {/* Three-dot menu */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <DotsIcon className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute bottom-full right-0 mb-1 w-44 rounded-lg bg-zinc-800 border border-zinc-700 shadow-xl py-1 z-10">
              <Link
                to={`/projects/${project.id}`}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                <ArrowRightIcon className="w-3.5 h-3.5 flex-shrink-0" />
                View project
              </Link>
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 hover:text-red-300 transition-colors"
              >
                <TrashIcon className="w-3.5 h-3.5 flex-shrink-0" />
                Delete project
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({ file, project, client }) {
  const { label, ext, content, date, pageFilename } = file
  const slug = project.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')

  function handleDownload() {
    if (ext === 'svg') {
      const wfFilename = pageFilename ? pageFilename.replace(/\.html$/, '') : 'wireframe'
      downloadBlob(content, `${slug}-wireframe-${wfFilename}.svg`, 'image/svg+xml')
      return
    }
    if (ext === 'html') {
      const htmlFilename = pageFilename ?? 'index.html'
      downloadBlob(content, `${slug}-${htmlFilename}`, 'text/html')
      return
    }
    if (ext === 'css') {
      downloadBlob(content, `${slug}-styles.css`, 'text/css')
      return
    }
    if (ext === 'js') {
      downloadBlob(content, `${slug}-script.js`, 'text/javascript')
      return
    }
    // PDF
    downloadPdf({
      agentName:   label,
      projectName: project.name,
      clientName:  client.name,
      date,
      bodyText:    content,
      filename:    `${slug}-${label.toLowerCase().replace(/\s+/g, '-')}.pdf`,
    })
  }

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <FileTypeIcon ext={ext} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-600 mt-0.5">{date} · .{ext}</p>
      </div>
      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors flex-shrink-0"
      >
        <DownloadIcon className="w-3.5 h-3.5" />
        Download
      </button>
    </div>
  )
}

// ── Edit panel ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['active', 'lead', 'inactive', 'needs attention']

function EditClientPanel({ client, open, onClose, onUpdated }) {
  const [form,      setForm]      = useState({})
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    if (client) setForm({ name: client.name ?? '', email: client.email ?? '', phone: client.phone ?? '', website: client.website ?? '', status: client.status ?? 'active', notes: client.notes ?? '' })
    setSaveError(null)
  }, [client, open])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const updates = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), website: form.website?.trim() || null, status: form.status, notes: form.notes.trim() }
    const { error } = await safeUpdate('clients', client.id, updates)
    setSaving(false)
    if (error) { setSaveError(error.message) } else { onUpdated({ ...client, ...updates }) }
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-semibold text-white">Edit client</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {saveError && (
            <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400">{saveError}</div>
          )}
          <Field label="Name">
            <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Website">
            <input type="url" value={form.website ?? ''} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://www.example.com" className={inputCls} />
          </Field>
          <Field label="Status">
            <select value={form.status ?? 'active'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea rows={4} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex-shrink-0 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !form.name?.trim()}
            className="flex-1 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors'

// ── Icons ─────────────────────────────────────────────────────────────────────

function FileTypeIcon({ ext }) {
  const map = {
    pdf:  { color: 'text-red-400',    label: 'PDF' },
    html: { color: 'text-orange-400', label: 'HTML' },
    css:  { color: 'text-blue-400',   label: 'CSS' },
    js:   { color: 'text-amber-400',  label: 'JS' },
    svg:  { color: 'text-violet-400', label: 'SVG' },
  }
  const { color, label } = map[ext] ?? { color: 'text-zinc-400', label: ext.toUpperCase() }
  return (
    <div className={`w-8 h-8 rounded-md bg-zinc-800 flex items-center justify-center flex-shrink-0 text-[9px] font-bold ${color}`}>
      {label}
    </div>
  )
}

function ChevronLeftIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronDownIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function PencilIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" />
    </svg>
  )
}

function DotsIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  )
}

function MailIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m2 7 10 7 10-7" />
    </svg>
  )
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function ArrowRightIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 12h12" />
    </svg>
  )
}

function FolderIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
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

function XIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function GlobeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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
