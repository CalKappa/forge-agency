import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AGENT_CONFIG, COLOR_CLASSES } from '../lib/agents'

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  client: {
    label: 'Client added',
    color: 'emerald',
    bg:    'bg-emerald-500/15',
    text:  'text-emerald-400',
    border:'border-emerald-500/30',
    dot:   'bg-emerald-400',
    Icon:  UserPlusIcon,
  },
  project: {
    label: 'Project created',
    color: 'violet',
    bg:    'bg-violet-500/15',
    text:  'text-violet-400',
    border:'border-violet-500/30',
    dot:   'bg-violet-400',
    Icon:  FolderPlusIcon,
  },
  brief: {
    label: 'Brief submitted',
    color: 'blue',
    bg:    'bg-blue-500/15',
    text:  'text-blue-400',
    border:'border-blue-500/30',
    dot:   'bg-blue-400',
    Icon:  FileTextIcon,
  },
  agent_message: {
    // color/icon resolved per-item from AGENT_CONFIG
    label: 'Agent message',
  },
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchFeed() {
  const [clientsRes, projectsRes, briefsRes, messagesRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, created_at')
      .order('created_at', { ascending: false })
      .limit(100),

    supabase
      .from('projects')
      .select('id, name, created_at, clients(name)')
      .order('created_at', { ascending: false })
      .limit(100),

    supabase
      .from('briefs')
      .select('id, brief_text, submitted_at, clients(name), projects(name)')
      .order('submitted_at', { ascending: false })
      .limit(100),

    supabase
      .from('agent_messages')
      .select('id, agent_key, role, content, created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const items = [
    ...(clientsRes.data ?? []).map(c => ({
      id:        `client-${c.id}`,
      type:      'client',
      timestamp:  c.created_at,
      title:     'New client added',
      primary:    c.name,
      secondary:  null,
      preview:    null,
    })),

    ...(projectsRes.data ?? []).map(p => ({
      id:        `project-${p.id}`,
      type:      'project',
      timestamp:  p.created_at,
      title:     'New project created',
      primary:    p.name,
      secondary:  p.clients?.name ?? null,
      preview:    null,
    })),

    ...(briefsRes.data ?? []).map(b => ({
      id:        `brief-${b.id}`,
      type:      'brief',
      timestamp:  b.submitted_at,
      title:     'Brief submitted',
      primary:    b.clients?.name ?? null,
      secondary:  b.projects?.name ?? null,
      preview:    b.brief_text,
    })),

    ...(messagesRes.data ?? []).map(m => {
      const agent = AGENT_CONFIG[m.agent_key]
      return {
        id:        `msg-${m.id}`,
        type:      'agent_message',
        agentKey:   m.agent_key,
        timestamp:  m.created_at,
        title:     `Message sent to ${agent?.label ?? m.agent_key}`,
        primary:    null,
        secondary:  null,
        preview:    m.content,
      }
    }),
  ]

  items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return items
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Activity() {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()

    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' },        load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },       load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefs' },         load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_messages' }, load)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function load() {
    const data = await fetchFeed()
    setItems(data)
    setLoading(false)
  }

  if (loading) return <FeedSkeleton />

  if (items.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-16 flex flex-col items-center gap-2">
        <p className="text-sm text-zinc-500">No activity yet</p>
        <p className="text-xs text-zinc-600">Add a client, create a project, or submit a brief to get started</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-0">
      {items.map((item, i) => (
        <FeedItem key={item.id} item={item} last={i === items.length - 1} />
      ))}
    </div>
  )
}

// ── Feed item ─────────────────────────────────────────────────────────────────

function FeedItem({ item, last }) {
  const cfg = resolveConfig(item)

  return (
    <div className="flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 ${cfg.bg} ${cfg.border}`}>
          <cfg.Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
        </div>
        {!last && <div className="w-px flex-1 bg-zinc-800 my-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${last ? 'pb-0' : 'pb-5'}`}>
        <div className="flex items-start justify-between gap-3 pt-1.5">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 leading-snug">{item.title}</p>

            {/* Primary + secondary labels */}
            {(item.primary || item.secondary) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {item.primary && (
                  <span className={`text-xs font-medium ${cfg.text}`}>{item.primary}</span>
                )}
                {item.primary && item.secondary && (
                  <span className="text-zinc-700">·</span>
                )}
                {item.secondary && (
                  <span className="text-xs text-zinc-500">{item.secondary}</span>
                )}
              </div>
            )}

            {/* Preview text */}
            {item.preview && (
              <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed mt-1">
                {item.preview}
              </p>
            )}
          </div>

          <time
            className="text-xs text-zinc-600 flex-shrink-0 pt-0.5 tabular-nums"
            title={new Date(item.timestamp).toLocaleString()}
          >
            {timeAgo(item.timestamp)}
          </time>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveConfig(item) {
  if (item.type !== 'agent_message') return TYPE_CONFIG[item.type]

  const agent = AGENT_CONFIG[item.agentKey]
  if (!agent) return { bg: 'bg-zinc-800', border: 'border-zinc-700', text: 'text-zinc-400', Icon: ChatIcon }

  const c = COLOR_CLASSES[agent.color]
  return {
    bg:     c.badge.split(' ')[0],
    border: c.badge.split(' ')[2],
    text:   c.icon,
    Icon:   ChatIcon,
  }
}

function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="max-w-2xl space-y-0">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center w-8">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 animate-pulse flex-shrink-0" />
            {i < 5 && <div className="w-px flex-1 bg-zinc-800 my-1" />}
          </div>
          <div className="flex-1 pb-5 pt-1.5 space-y-2">
            <div className="h-3.5 w-48 rounded bg-zinc-800 animate-pulse" />
            <div className="h-3 w-24 rounded bg-zinc-800 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function UserPlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" strokeLinecap="round" />
      <line x1="16" y1="11" x2="22" y2="11" strokeLinecap="round" />
    </svg>
  )
}

function FolderPlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" strokeLinecap="round" />
      <line x1="9"  y1="14" x2="15" y2="14" strokeLinecap="round" />
    </svg>
  )
}

function FileTextIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline strokeLinecap="round" strokeLinejoin="round" points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8"  y2="13" strokeLinecap="round" />
      <line x1="16" y1="17" x2="8"  y2="17" strokeLinecap="round" />
      <line x1="10" y1="9"  x2="8"  y2="9"  strokeLinecap="round" />
    </svg>
  )
}

function ChatIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
