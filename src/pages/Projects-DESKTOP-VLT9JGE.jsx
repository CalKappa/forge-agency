import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { safeUpdate } from '../lib/supabaseHelpers'
import { useUI } from '../context/UIContext'
import { useConfirm } from '../context/ConfirmContext'
import { useToast } from '../context/ToastContext'

const STAGES = ['Not Started', 'Research', 'Design', 'Dev', 'Review', 'Delivered']

const STAGE_CONFIG = {
  'Not Started': { bg: 'bg-red-500/15',     text: 'text-red-400',     border: 'border-red-500/30'     },
  Research:      { bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  Design:        { bg: 'bg-violet-500/15',  text: 'text-violet-400',  border: 'border-violet-500/30'  },
  Dev:           { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/30'  },
  Review:        { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
  Delivered:     { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
}

export default function Projects() {
  const [projects,          setProjects]          = useState([])
  const [loading,           setLoading]           = useState(true)
  const [error,             setError]             = useState(null)
  const [stage,             setStage]             = useState('All')
  const [submittedTokenIds, setSubmittedTokenIds] = useState(new Set())
  const { lastCreatedProject }  = useUI()
  const processedProjectRef     = useRef(null)

  useEffect(() => {
    fetchProjects()

    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, fetchProjects)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // Immediately fetch when a new project is created anywhere in the app
  useEffect(() => {
    if (!lastCreatedProject) return
    if (lastCreatedProject.id === processedProjectRef.current) return
    processedProjectRef.current = lastCreatedProject.id
    fetchProjects()
  }, [lastCreatedProject])

  async function fetchProjects() {
    const [{ data, error }, { data: tokenData }] = await Promise.all([
      supabase.from('projects').select('*, clients(name)').order('created_at', { ascending: false }),
      supabase.from('client_brief_tokens').select('project_id').eq('status', 'submitted'),
    ])

    if (error) setError(error.message)
    else setProjects(data)
    setSubmittedTokenIds(new Set((tokenData ?? []).map(r => r.project_id)))
    setLoading(false)
  }

  const filtered = stage === 'All'
    ? projects
    : projects.filter(p => p.current_stage === stage)

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {['All', ...STAGES].map(s => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              stage === s
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            {s}
            {s !== 'All' && (
              <span className={`ml-1.5 tabular-nums ${stage === s ? 'text-violet-300' : 'text-zinc-600'}`}>
                {projects.filter(p => p.current_stage === s).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400">
          Failed to load projects: {error}
        </div>
      )}

      {/* Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-zinc-800" />
              <div className="h-3 w-1/3 rounded bg-zinc-800" />
              <div className="flex justify-between pt-2">
                <div className="h-5 w-20 rounded-full bg-zinc-800" />
                <div className="h-3 w-16 rounded bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-14 flex flex-col items-center gap-2">
          <p className="text-sm text-zinc-500">
            {stage !== 'All' ? `No projects in ${stage}` : 'No projects yet'}
          </p>
        </div>
      )}

      {/* Cards */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              hasBriefAlert={submittedTokenIds.has(project.id) && project.current_stage === 'Not Started'}
              onAdvanced={updated =>
                setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, current_stage: updated.current_stage } : p))
              }
              onDeleted={id =>
                setProjects(prev => prev.filter(p => p.id !== id))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, hasBriefAlert, onAdvanced, onDeleted }) {
  const [advancing,  setAdvancing]  = useState(false)
  const [menuOpen,   setMenuOpen]   = useState(false)
  const menuRef   = useRef(null)
  const confirm   = useConfirm()
  const showToast = useToast()

  const stageCfg   = STAGE_CONFIG[project.current_stage]
  const clientName = project.clients?.name ?? '—'
  const createdAt  = project.created_at
    ? new Date(project.created_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : '—'

  const currentIdx = STAGES.indexOf(project.current_stage)
  const nextStage  = currentIdx >= 0 && currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1] : null

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  async function advanceStage() {
    if (!nextStage) return
    setAdvancing(true)
    const { error } = await safeUpdate('projects', project.id, { current_stage: nextStage })
    setAdvancing(false)
    if (!error) onAdvanced({ id: project.id, current_stage: nextStage })
  }

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
    <div className="group rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 flex flex-col transition-colors">
      {/* Clickable content area */}
      <Link to={`/projects/${project.id}`} className="p-5 flex flex-col gap-4 flex-1">
        {/* Name + client */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            {hasBriefAlert && (
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            )}
            <h3 className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">
              {project.name}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 min-w-0">
            <LinkIcon className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{clientName}</span>
          </div>
        </div>

        {/* Stage badge + date */}
        <div className="flex items-center justify-between gap-3 mt-auto">
          {stageCfg ? (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${stageCfg.bg} ${stageCfg.text} ${stageCfg.border}`}>
              {project.current_stage}
            </span>
          ) : (
            <span className="text-xs text-zinc-600">No stage set</span>
          )}
          <span className="text-xs text-zinc-600 flex-shrink-0">{createdAt}</span>
        </div>
      </Link>

      {/* Action footer */}
      <div className="border-t border-zinc-800 px-4 py-2.5 flex items-center gap-2">
        {nextStage ? (
          <button
            onClick={advanceStage}
            disabled={advancing}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightIcon className="w-3.5 h-3.5" />
            {advancing ? 'Moving…' : `Move to ${nextStage}`}
          </button>
        ) : (
          <p className="flex-1 text-center text-xs text-zinc-600 py-1.5">Delivered</p>
        )}

        {/* Three-dot menu */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={e => { e.preventDefault(); setMenuOpen(o => !o) }}
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

function LinkIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1" />
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

function DotsIcon({ className }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
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
