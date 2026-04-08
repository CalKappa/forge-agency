import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useUI } from '../context/UIContext'

// ── Stage config (mirrors Projects page) ─────────────────────────────────────
const STAGE_CONFIG = {
  Research:  { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  Design:    { bg: 'bg-violet-500/15',  text: 'text-violet-400',  border: 'border-violet-500/30'  },
  Dev:       { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  Review:    { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
  Delivered: { bg: 'bg-zinc-700/40',    text: 'text-zinc-400',    border: 'border-zinc-600/40'    },
}

// ── Agent pipeline parser ─────────────────────────────────────────────────────
const PIPELINE_AGENTS = [
  { key: 'Researcher', color: 'blue'    },
  { key: 'Designer',   color: 'violet'  },
  { key: 'Developer',  color: 'emerald' },
  { key: 'Reviewer',   color: 'amber'   },
]

const PIPELINE_COLOR = {
  blue:    { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',       icon: 'text-blue-400',    dot: 'bg-blue-400'    },
  violet:  { badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30', icon: 'text-violet-400',  dot: 'bg-violet-400'  },
  emerald: { badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: 'text-emerald-400', dot: 'bg-emerald-400' },
  amber:   { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',    icon: 'text-amber-400',   dot: 'bg-amber-400'   },
}

function parseResponse(text) {
  if (!text) return null
  const headerRegex = /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\*{1,2})?(\d+\)?\s*(?:Researcher|Designer|Developer|Reviewer))(?:\*{1,2})?[:\s]*/gi
  const parts = []
  let lastIndex = 0
  let match
  const re = new RegExp(headerRegex.source, 'gi')
  while ((match = re.exec(text)) !== null) {
    if (parts.length > 0) parts[parts.length - 1].content = text.slice(lastIndex, match.index).trim()
    const label = match[1].replace(/^\d+\)\s*/, '').trim()
    parts.push({ label, content: '' })
    lastIndex = match.index + match[0].length
  }
  if (parts.length > 0) parts[parts.length - 1].content = text.slice(lastIndex).trim()
  return PIPELINE_AGENTS.map(agent => {
    const found = parts.find(p => p.label.toLowerCase().includes(agent.key.toLowerCase()))
    return { ...agent, tasks: found ? found.content : '' }
  })
}

// ── Currency formatter ────────────────────────────────────────────────────────
function fmtGBP(amount) {
  return `£${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Data fetch ────────────────────────────────────────────────────────────────
async function fetchDashboardData() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    activeProjectsRes,
    clientsRes,
    deliveredThisMonthRes,
    revenueRes,
    recentProjectsRes,
    latestBriefRes,
    submittedTokensRes,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .neq('current_stage', 'Delivered'),

    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true }),

    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('current_stage', 'Delivered')
      .gte('created_at', monthStart),

    supabase
      .from('invoices')
      .select('amount')
      .eq('status', 'paid')
      .eq('currency', 'GBP')
      .gte('created_at', monthStart),

    supabase
      .from('projects')
      .select('id, name, current_stage, created_at, clients(name)')
      .neq('current_stage', 'Delivered')
      .order('created_at', { ascending: false })
      .limit(5),

    // Fetch the most recent brief regardless of whether orchestrator_response is set —
    // structured briefs store the Orchestrator output in agent_outputs, not briefs.
    supabase
      .from('briefs')
      .select('id, brief_text, submitted_at, orchestrator_response, project_id, clients(name), projects(name)')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single(),

    // Which projects have a submitted brief token (for the alert badge)
    supabase
      .from('client_brief_tokens')
      .select('project_id')
      .eq('status', 'submitted'),
  ])

  const revenueThisMonth = (revenueRes.data ?? []).reduce((sum, inv) => sum + Number(inv.amount), 0)

  // Resolve orchestrator text: prefer briefs.orchestrator_response (quick brief panel),
  // fall back to agent_outputs (structured brief template).
  let latestBrief = latestBriefRes.data ?? null
  if (latestBrief) {
    let orchText = latestBrief.orchestrator_response ?? null
    if (!orchText && latestBrief.project_id) {
      const { data: orchRecord } = await supabase
        .from('agent_outputs')
        .select('output_text')
        .eq('project_id', latestBrief.project_id)
        .eq('agent_name', 'Orchestrator')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      orchText = orchRecord?.output_text ?? null
    }
    // Normalise onto orchestrator_response so the rest of the component is unchanged
    latestBrief = { ...latestBrief, orchestrator_response: orchText }
  }

  return {
    stats: {
      activeProjects:      activeProjectsRes.count     ?? 0,
      totalClients:        clientsRes.count            ?? 0,
      deliveredThisMonth:  deliveredThisMonthRes.count ?? 0,
      revenueThisMonth,
    },
    recentProjects: recentProjectsRes.data ?? [],
    latestBrief,
    submittedTokenIds: new Set((submittedTokensRes.data ?? []).map(r => r.project_id)),
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const { dashboardVersion } = useUI()

  useEffect(() => {
    load()

    const channel = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' },       load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },      load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefs' },        load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' },      load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_outputs' }, load)
      .subscribe()

    return () => supabase.removeChannel(channel)
  // Re-subscribe and reload whenever dashboardVersion bumps (brief submitted externally)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardVersion])

  async function load() {
    const result = await fetchDashboardData()
    setData(result)
    setLoading(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) return <DashboardSkeleton />

  const { stats, recentProjects, latestBrief, submittedTokenIds } = data
  const pipelineSections = parseResponse(latestBrief?.orchestrator_response)

  return (
    <div className="space-y-6">

      {/* ── Refresh button row ── */}
      <div className="flex items-center justify-end -mb-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh dashboard"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <RefreshIcon className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Active projects"
          value={stats.activeProjects}
          icon={FolderIcon}
          color="violet"
        />
        <StatCard
          label="Total clients"
          value={stats.totalClients}
          icon={UsersIcon}
          color="blue"
        />
        <StatCard
          label="Delivered this month"
          value={stats.deliveredThisMonth}
          icon={CheckCircleIcon}
          color="emerald"
        />
        <StatCard
          label="Revenue this month"
          value={fmtGBP(stats.revenueThisMonth)}
          icon={CurrencyIcon}
          color="amber"
          mono
        />
      </div>

      {/* ── Lower grid: active projects + pipeline ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Active projects list */}
        <div className="xl:col-span-2 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Active projects</span>
            <Link to="/projects" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
              View all →
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-5 py-10">
              <p className="text-xs text-zinc-600">No active projects</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {recentProjects.map(project => {
                const sc = STAGE_CONFIG[project.current_stage] ?? STAGE_CONFIG.Research
                const hasBriefAlert = submittedTokenIds.has(project.id) && project.current_stage === 'Not Started'
                return (
                  <li key={project.id}>
                    <Link
                      to={`/projects/${project.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        {hasBriefAlert && (
                          <span className="relative flex h-2 w-2 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">{project.name}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{project.clients?.name ?? '—'}</p>
                        </div>
                      </div>
                      <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${sc.bg} ${sc.text} ${sc.border}`}>
                        {project.current_stage}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Agent pipeline */}
        <div className="xl:col-span-3 space-y-4">
          {latestBrief ? (
            <>
              {/* Brief context */}
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Latest brief</span>
                  {latestBrief.clients?.name && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-zinc-300 font-medium">{latestBrief.clients.name}</span>
                    </>
                  )}
                  {latestBrief.projects?.name && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span>{latestBrief.projects.name}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">
                  {latestBrief.brief_text}
                </p>
              </div>

              {/* Pipeline label */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Agent pipeline</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>

              {/* Pipeline cards */}
              {pipelineSections && (
                <div className="grid grid-cols-2 gap-3">
                  {pipelineSections.map((agent, i) => (
                    <PipelineCard
                      key={agent.key}
                      agent={agent}
                      index={i}
                      total={pipelineSections.length}
                      briefText={latestBrief.brief_text}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-16 flex flex-col items-center gap-2">
              <p className="text-sm text-zinc-500">No briefs submitted yet</p>
              <p className="text-xs text-zinc-600">Submit a brief to see the agent pipeline here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
const STAT_COLOR = {
  violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/20',  value: 'text-violet-300'  },
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    value: 'text-blue-300'    },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', value: 'text-emerald-300' },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   value: 'text-amber-300'   },
}

function StatCard({ label, value, icon: Icon, color, mono = false }) {
  const c = STAT_COLOR[color]
  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center border ${c.bg} ${c.border}`}>
          <Icon className={`w-3.5 h-3.5 ${c.text}`} />
        </div>
      </div>
      <p className={`text-2xl font-semibold ${c.value} ${mono ? 'tabular-nums' : ''}`}>{value}</p>
    </div>
  )
}

// ── Pipeline card ─────────────────────────────────────────────────────────────
const AGENT_ICONS = {
  Researcher: SearchIcon,
  Designer:   PenIcon,
  Developer:  CodeIcon,
  Reviewer:   CheckIcon,
}

function PipelineCard({ agent, briefText }) {
  const c    = PIPELINE_COLOR[agent.color]
  const Icon = AGENT_ICONS[agent.key] ?? SearchIcon
  const tasks = agent.tasks
    ? agent.tasks
        .split('\n')
        .map(l => l.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean)
    : []

  return (
    <Link
      to={`/agents/${agent.key.toLowerCase()}`}
      state={{ briefText }}
      className="flex flex-col rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 p-4 gap-3 transition-colors group"
    >
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center border ${c.badge}`}>
          <Icon className={`w-3 h-3 ${c.icon}`} />
        </div>
        <span className={`text-xs font-semibold ${c.icon}`}>{agent.key}</span>
        <span className="ml-auto text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">Chat →</span>
      </div>
      <ul className="space-y-1.5 flex-1">
        {tasks.length > 0 ? tasks.slice(0, 4).map((task, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-400 leading-relaxed">
            <span className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${c.dot}`} />
            {task}
          </li>
        )) : (
          <li className="text-xs text-zinc-600 italic">No tasks parsed</li>
        )}
        {tasks.length > 4 && (
          <li className="text-xs text-zinc-600">+{tasks.length - 4} more</li>
        )}
      </ul>
    </Link>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-zinc-800" />
              <div className="w-7 h-7 rounded-md bg-zinc-800" />
            </div>
            <div className="h-7 w-20 rounded bg-zinc-800" />
          </div>
        ))}
      </div>
      {/* Lower grid */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2 rounded-lg bg-zinc-900 border border-zinc-800 animate-pulse">
          <div className="px-5 py-4 border-b border-zinc-800">
            <div className="h-3 w-28 rounded bg-zinc-800" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 last:border-0">
              <div className="space-y-1.5">
                <div className="h-3 w-36 rounded bg-zinc-800" />
                <div className="h-2.5 w-24 rounded bg-zinc-800" />
              </div>
              <div className="h-5 w-16 rounded-full bg-zinc-800" />
            </div>
          ))}
        </div>
        <div className="xl:col-span-3 space-y-4 animate-pulse">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 space-y-2">
            <div className="h-3 w-40 rounded bg-zinc-800" />
            <div className="h-3 w-full rounded bg-zinc-800" />
            <div className="h-3 w-4/5 rounded bg-zinc-800" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-zinc-800" />
                  <div className="h-3 w-16 rounded bg-zinc-800" />
                </div>
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-2.5 rounded bg-zinc-800" style={{ width: `${60 + (j % 3) * 15}%` }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function FolderIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
}
function UsersIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
}
function CheckCircleIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
}
function CurrencyIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121A3 3 0 1 1 9.88 9.88M12 4v1m0 14v1M4.22 4.22l.707.707m12.02 12.02.707.707M1 12h1m20 0h1M4.22 19.78l.707-.707M18.364 5.636l.707-.707" /></svg>
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
function RefreshIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" /></svg>
}
