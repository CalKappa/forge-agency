import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-950/60',    border: 'border-red-700/50',    badge: 'bg-red-900/80 text-red-300',    label: 'Critical' },
  high:     { bg: 'bg-orange-950/60', border: 'border-orange-700/50', badge: 'bg-orange-900/80 text-orange-300', label: 'High' },
  medium:   { bg: 'bg-amber-950/40',  border: 'border-amber-700/40',  badge: 'bg-amber-900/80 text-amber-300',  label: 'Medium' },
  low:      { bg: 'bg-zinc-900',       border: 'border-zinc-700/50',  badge: 'bg-zinc-800 text-zinc-400',       label: 'Low' },
}

const AGENT_STYLES = {
  'Developer-CSS':   'bg-blue-900/60 text-blue-300',
  'Developer-JS':    'bg-violet-900/60 text-violet-300',
  'Developer-HTML':  'bg-emerald-900/60 text-emerald-300',
  'Developer-Pages': 'bg-amber-900/60 text-amber-300',
}

const CATEGORIES = ['All', 'CSS', 'JavaScript', 'HTML', 'Performance', 'Accessibility', 'SEO', 'Security', 'UX']

export default function LessonsLearned() {
  const [lessons,       setLessons]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [category,      setCategory]      = useState('All')
  const [showResolved,  setShowResolved]  = useState(false)
  const [deletingId,    setDeletingId]    = useState(null)
  const [togglingId,    setTogglingId]    = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('lessons_learned')
      .select('*')
      .order('occurrence_count', { ascending: false })
    if (!error) setLessons(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id) {
    setDeletingId(id)
    await supabase.from('lessons_learned').delete().eq('id', id)
    setLessons(prev => prev.filter(l => l.id !== id))
    setDeletingId(null)
  }

  async function handleToggleResolved(lesson) {
    setTogglingId(lesson.id)
    const { error } = await supabase
      .from('lessons_learned')
      .update({ resolved: !lesson.resolved })
      .eq('id', lesson.id)
    if (!error) setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, resolved: !lesson.resolved } : l))
    setTogglingId(null)
  }

  const filtered = lessons.filter(l => {
    if (!showResolved && l.resolved) return false
    if (category !== 'All' && l.category !== category) return false
    if (search) {
      const q = search.toLowerCase()
      return l.issue.toLowerCase().includes(q) || l.fix.toLowerCase().includes(q) || l.category.toLowerCase().includes(q)
    }
    return true
  })

  const grouped = CATEGORIES.slice(1).reduce((acc, cat) => {
    const items = filtered.filter(l => l.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  const totalActive   = lessons.filter(l => !l.resolved).length
  const totalResolved = lessons.filter(l => l.resolved).length
  const totalCritical = lessons.filter(l => !l.resolved && l.severity === 'critical').length

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Active Lessons</p>
          <p className="text-2xl font-bold text-zinc-100">{totalActive}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Critical Issues</p>
          <p className="text-2xl font-bold text-red-400">{totalCritical}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-1">Resolved</p>
          <p className="text-2xl font-bold text-emerald-400">{totalResolved}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search lessons…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500"
        />
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowResolved(p => !p)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            showResolved ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-900 border border-zinc-700 text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          {lessons.length === 0
            ? 'No lessons learned yet. Run a QA check on a project to start capturing insights.'
            : 'No lessons match your filters.'}
        </div>
      ) : category !== 'All' ? (
        // Single category view — flat list
        <div className="space-y-3">
          {filtered.map(lesson => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              onDelete={handleDelete}
              onToggleResolved={handleToggleResolved}
              deletingId={deletingId}
              togglingId={togglingId}
            />
          ))}
        </div>
      ) : (
        // All categories — grouped
        <div className="space-y-8">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-zinc-300">{cat}</h2>
                <span className="px-1.5 py-0.5 rounded text-xs bg-zinc-800 text-zinc-500">{items.length}</span>
              </div>
              <div className="space-y-3">
                {items.map(lesson => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    onDelete={handleDelete}
                    onToggleResolved={handleToggleResolved}
                    deletingId={deletingId}
                    togglingId={togglingId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LessonCard({ lesson, onDelete, onToggleResolved, deletingId, togglingId }) {
  const sev    = SEVERITY_STYLES[lesson.severity] ?? SEVERITY_STYLES.medium
  const agCls  = AGENT_STYLES[lesson.agent] ?? 'bg-zinc-800 text-zinc-400'
  const isDeleting = deletingId === lesson.id
  const isToggling = togglingId  === lesson.id

  return (
    <div className={`rounded-xl border p-4 transition-opacity ${sev.bg} ${sev.border} ${lesson.resolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${sev.badge}`}>{sev.label}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${agCls}`}>{lesson.agent}</span>
            {lesson.occurrence_count > 1 && (
              <span className="px-2 py-0.5 rounded text-xs bg-zinc-800/80 text-zinc-400">
                Seen {lesson.occurrence_count}×
              </span>
            )}
            {lesson.resolved && (
              <span className="px-2 py-0.5 rounded text-xs bg-emerald-900/60 text-emerald-400">Resolved</span>
            )}
          </div>
          <p className="text-sm text-red-300 font-medium leading-snug">{lesson.issue}</p>
          <p className="text-sm text-emerald-300 leading-snug">{lesson.fix}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onToggleResolved(lesson)}
            disabled={isToggling}
            title={lesson.resolved ? 'Mark as active' : 'Mark as resolved'}
            className="p-1.5 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
          >
            {isToggling ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <button
            onClick={() => onDelete(lesson.id)}
            disabled={isDeleting}
            title="Delete lesson"
            className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
