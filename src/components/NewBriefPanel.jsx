import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { safeUpdate } from '../lib/supabaseHelpers'
import { ORCHESTRATOR_SYSTEM } from '../lib/anthropic'
import { streamAnthropicCall } from '../lib/streamHelper'

const PAGE_EXTRACTOR_SYSTEM = `Output ONLY a valid JSON array of page objects. Every page must have a unique filename. Never include the same page twice. The homepage must appear exactly once with filename index.html. For filenames use only lowercase letters, numbers and hyphens — no special characters, no ampersands, no spaces. For page names use plain readable English with no special characters — replace ampersands with the word and. Each object must have two keys: name which is the page name for example Home, About, Services, Contact, and filename which is the HTML filename for example index.html, about.html, services.html, contact.html. Output only the raw JSON array with no explanation and no markdown code blocks.`

function sanitiseExtractedPages(pages) {
  return pages
    .map(p => ({
      name:     p.name.replace(/&/g, 'and').replace(/[^a-zA-Z0-9 \-\.]/g, '').trim(),
      filename: p.filename.replace(/&/g, 'and').replace(/[^a-zA-Z0-9\s\-\.]/g, '').replace(/\s+/g, '-').toLowerCase(),
    }))
    .filter((page, index, self) => index === self.findIndex(p => p.filename === page.filename))
}

// Per-project extraction guard: projectId → true when in flight
const pageExtractionInFlight = {}

const EMPTY = { clientId: '', projectId: '', briefText: '', isReplication: false, replicationUrl: '' }

// Phases: form → submitting → streaming → done | error
export default function NewBriefPanel({ open, onClose }) {
  const [form, setForm]                         = useState(EMPTY)
  const [clients, setClients]                   = useState([])
  const [projects, setProjects]                 = useState([])
  const [briefedProjectIds, setBriefedProjectIds] = useState(new Set())
  const [allProjectsByClient, setAllProjectsByClient] = useState({})
  const [phase, setPhase]                       = useState('form')
  const [result, setResult]                     = useState('')
  const [error, setError]                       = useState(null)
  const briefRef                                = useRef(null)
  const resultRef                               = useRef(null)

  // On open: fetch clients, all projects, and briefed IDs (briefs + drafts) in one shot
  useEffect(() => {
    if (!open) return
    setForm(EMPTY)
    setProjects([])
    setPhase('form')
    setResult('')
    setError(null)
    setTimeout(() => briefRef.current?.focus(), 80)

    Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('projects').select('id, name, client_id').order('name'),
      supabase.from('briefs').select('project_id').not('project_id', 'is', null),
      supabase.from('briefs_structured').select('project_id').not('project_id', 'is', null),
    ]).then(([{ data: clientsData }, { data: projectsData }, { data: briefsData }, { data: draftsData }]) => {
      const briefedIds = new Set([
        ...(briefsData  ?? []).map(r => r.project_id),
        ...(draftsData  ?? []).map(r => r.project_id),
      ])
      const byClient = {}
      for (const p of (projectsData ?? [])) {
        if (!byClient[p.client_id]) byClient[p.client_id] = []
        byClient[p.client_id].push(p)
      }
      setClients(clientsData ?? [])
      setBriefedProjectIds(briefedIds)
      setAllProjectsByClient(byClient)
    })
  }, [open])

  // Recompute available projects whenever client or briefed IDs change
  useEffect(() => {
    if (!form.clientId) { setProjects([]); return }
    const clientProjs = allProjectsByClient[form.clientId] ?? []
    setProjects(clientProjs.filter(p => !briefedProjectIds.has(p.id)))
  }, [form.clientId, allProjectsByClient, briefedProjectIds])

  // Scroll result panel into view as text streams in
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight
    }
  }, [result])

  // Close on Escape (only in form phase)
  useEffect(() => {
    if (!open || phase !== 'form') return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, phase, onClose])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.briefText.trim() || !form.clientId) return

    setPhase('submitting')
    setError(null)

    // 1. Save to Supabase
    const { data: inserted, error: dbError } = await supabase
      .from('briefs')
      .insert({
        client_id:  form.clientId,
        project_id: form.projectId || null,
        brief_text: form.briefText.trim(),
      })
      .select('id')
      .single()

    if (dbError) {
      setError(dbError.message)
      setPhase('error')
      return
    }

    // 2. Extract pages (if linked to a project)
    let pagesContext = ''
    if (form.projectId) {
      if (pageExtractionInFlight[form.projectId]) {
        console.warn('[PageExtractor] Already running for project', form.projectId, '— skipping')
      } else {
        pageExtractionInFlight[form.projectId] = true
        try {
          console.log('[PageExtractor] Running on brief text (quick panel), project:', form.projectId)
          const { text: raw } = await streamAnthropicCall({
            messages:     [{ role: 'user', content: form.briefText.trim() }],
            systemPrompt: PAGE_EXTRACTOR_SYSTEM,
            model:        'claude-haiku-4-5-20251001',
            maxTokens:    8000,
          })
          console.log('[PageExtractor] Raw API response:', raw)
          const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
          const parsed = JSON.parse(cleaned)
          console.log('[PageExtractor] Parsed pages:', JSON.stringify(parsed))
          const pages = sanitiseExtractedPages(parsed)
          console.log('[PageExtractor] Final clean pages:', JSON.stringify(pages))
          if (Array.isArray(pages) && pages.length) {
            console.log('[PageExtractor] Clearing existing pages before save...')
            await safeUpdate('projects', form.projectId, { pages: null })
            console.log('[PageExtractor] Saving to Supabase — exact array:', JSON.stringify(pages))
            const replicationFields = form.isReplication && form.replicationUrl.trim()
              ? { is_replication: true, replication_url: form.replicationUrl.trim() }
              : {}
            await safeUpdate('projects', form.projectId, { pages, ...replicationFields })
            pagesContext = `\n\nThis site has the following pages: ${pages.map(p => `${p.name} (${p.filename})`).join(', ')}. Break down tasks for each agent considering all pages.`
          }
        } catch (err) {
          console.warn('[PageExtractor] Page extraction failed:', err.message)
        } finally {
          delete pageExtractionInFlight[form.projectId]
        }
      }
    }

    // 3. Stream orchestrator response
    const replicationContext = form.isReplication && form.replicationUrl.trim()
      ? `\n\nREPLICATION MODE: Agents must analyse ${form.replicationUrl.trim()} and mirror its structure, layout, navigation and design as closely as possible. This is a like-for-like rebuild, not a redesign.`
      : ''
    setPhase('streaming')
    try {
      let fullResponse = ''
      await streamAnthropicCall({
        messages:     [{ role: 'user', content: form.briefText.trim() + pagesContext + replicationContext }],
        systemPrompt: ORCHESTRATOR_SYSTEM,
        model:        'claude-opus-4-20250514',
        maxTokens:    2048,
        onChunk: (chunk) => {
          fullResponse += chunk
          setResult(prev => prev + chunk)
        },
      })

      // 4. Persist the full orchestrator response
      await safeUpdate('briefs', inserted.id, { orchestrator_response: fullResponse })

      setPhase('done')
    } catch (err) {
      setError(err.message ?? 'Failed to get orchestrator response')
      setPhase('error')
    }
  }

  function handleReset() {
    setForm(EMPTY)
    setProjects([])
    setPhase('form')
    setResult('')
    setError(null)
  }

  const isStreaming  = phase === 'streaming'
  const isSubmitting = phase === 'submitting'
  const isBusy       = isStreaming || isSubmitting
  const showResults  = phase === 'streaming' || phase === 'done' || phase === 'error'
  const canSubmit    = form.briefText.trim() && form.clientId

  const selectedClient = clients.find(c => c.id === form.clientId)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={!isBusy ? onClose : undefined}
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-lg bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">New brief</h2>
            {showResults && selectedClient && (
              <p className="text-xs text-zinc-500 mt-0.5">{selectedClient.name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Form */}
          <div className={`px-6 py-6 space-y-5 ${showResults ? 'border-b border-zinc-800' : ''}`}>
            <Field label="Client" required>
              <select
                value={form.clientId || ''}
                onChange={e => set('clientId', e.target.value)}
                disabled={showResults}
                className={selectCls(showResults)}
              >
                <option value="" disabled>Select a client…</option>
                {clients.map(c => {
                  const clientProjs = allProjectsByClient[c.id] ?? []
                  const allBriefed  = clientProjs.length > 0 && clientProjs.every(p => briefedProjectIds.has(p.id))
                  return (
                    <option key={c.id} value={c.id} disabled={allBriefed}>
                      {c.name}{allBriefed ? ' (No available projects)' : ''}
                    </option>
                  )
                })}
              </select>
            </Field>

            <Field label="Project">
              <select
                value={form.projectId || ''}
                onChange={e => set('projectId', e.target.value)}
                disabled={!form.clientId || showResults}
                className={selectCls(!form.clientId || showResults)}
              >
                <option value="">No project (brief only)</option>
                {(() => {
                  const clientProjs = allProjectsByClient[form.clientId] ?? []
                  const allBriefed  = form.clientId && clientProjs.length > 0 && projects.length === 0
                  if (allBriefed) {
                    return (
                      <option value="" disabled>
                        All projects for this client already have a brief — delete the existing brief to create a new one
                      </option>
                    )
                  }
                  return projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                })()}
              </select>
            </Field>

            <Field label="Brief" required>
              <textarea
                ref={briefRef}
                value={form.briefText || ''}
                onChange={e => set('briefText', e.target.value)}
                disabled={showResults}
                placeholder="Describe the project goals, target audience, key deliverables, brand guidelines, and any other relevant context…"
                rows={showResults ? 4 : 6}
                className={`${inputCls} resize-none ${showResults ? 'opacity-60 cursor-default' : ''}`}
              />
            </Field>

            {!showResults && (
              <div className="space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className="relative flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={form.isReplication ?? false}
                      onChange={e => set('isReplication', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-4 h-4 rounded border border-zinc-600 bg-zinc-800 peer-checked:bg-violet-600 peer-checked:border-violet-600 transition-colors flex items-center justify-center">
                      {form.isReplication && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">Replicate existing site</span>
                </label>

                {form.isReplication && (
                  <input
                    type="url"
                    value={form.replicationUrl || ''}
                    onChange={e => set('replicationUrl', e.target.value)}
                    placeholder="https://example.com"
                    className={inputCls}
                  />
                )}
              </div>
            )}
          </div>

          {/* Results */}
          {showResults && (
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center gap-2">
                <SparklesIcon className={`w-4 h-4 ${isStreaming ? 'text-violet-400 animate-pulse' : 'text-violet-400'}`} />
                <span className="text-xs font-medium text-zinc-300">
                  {isStreaming ? 'Orchestrating…' : phase === 'error' ? 'Error' : 'Orchestration complete'}
                </span>
              </div>

              {error && (
                <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-xs text-red-400">
                  {error}
                </div>
              )}

              {result && (
                <div
                  ref={resultRef}
                  className="rounded-lg bg-zinc-950 border border-zinc-800 p-4 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono max-h-[420px] overflow-y-auto"
                >
                  {result}
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-violet-400 ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 flex-shrink-0">
          {phase === 'form' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-4 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Submit brief
              </button>
            </>
          )}

          {isSubmitting && (
            <span className="text-xs text-zinc-500">Saving brief and extracting pages…</span>
          )}

          {isStreaming && (
            <span className="text-xs text-zinc-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Generating task lists…
            </span>
          )}

          {(phase === 'done' || phase === 'error') && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
              >
                New brief
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-zinc-400">
        {label}{required && <span className="text-violet-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 rounded-md bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors'

function selectCls(disabled) {
  return `${inputCls} ${disabled ? 'opacity-60 cursor-default' : ''}`
}

function XIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function SparklesIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  )
}
