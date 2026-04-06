import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY = { name: '', email: '', phone: '', website: '', status: 'active', notes: '' }

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active'           },
  { value: 'lead',     label: 'Needs attention'  },
  { value: 'inactive', label: 'Inactive'         },
]

export default function NewClientPanel({ open, onClose }) {
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)
  const nameRef               = useRef(null)

  // Focus name field when panel opens; reset when it closes
  useEffect(() => {
    if (open) {
      setForm(EMPTY)
      setError(null)
      setTimeout(() => nameRef.current?.focus(), 80)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return

    setSaving(true)
    setError(null)

    const { error } = await supabase.from('clients').insert({
      name:    form.name.trim(),
      email:   form.email.trim()   || null,
      phone:   form.phone.trim()   || null,
      website: form.website.trim() || null,
      status:  form.status,
      notes:   form.notes.trim()   || null,
    })

    setSaving(false)

    if (error) {
      setError(error.message)
    } else {
      onClose()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-semibold text-white">New client</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <Field label="Name" required>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Acme Corp"
              required
              className={inputCls}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="hello@acme.com"
              className={inputCls}
            />
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="+1 555 000 0000"
              className={inputCls}
            />
          </Field>

          <Field label="Website">
            <input
              type="url"
              value={form.website}
              onChange={e => set('website', e.target.value)}
              placeholder="https://www.example.com"
              className={inputCls}
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className={inputCls}
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Any context about this client…"
              rows={4}
              className={`${inputCls} resize-none`}
            />
          </Field>

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save client'}
          </button>
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

function XIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
