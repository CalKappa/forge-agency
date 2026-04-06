import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { safeUpdate } from '../lib/supabaseHelpers'
import { useUI } from '../context/UIContext'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  paid:    { label: 'Paid',    bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  sent:    { label: 'Sent',    bg: 'bg-blue-500/15',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  overdue: { label: 'Overdue', bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
  draft:   { label: 'Draft',   bg: 'bg-zinc-700/40',    text: 'text-zinc-400',    border: 'border-zinc-700'        },
}

const SYMBOL = { GBP: '£', USD: '$', EUR: '€' }

function fmt(amount, currency = 'GBP') {
  const sym = SYMBOL[currency] ?? currency + ' '
  return `${sym}${Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function computeStats(invoices) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  let paidThisMonth = 0
  let outstanding   = 0
  let overdue       = 0

  for (const inv of invoices) {
    const amount = Number(inv.amount)
    if (inv.status === 'paid') {
      if (new Date(inv.created_at) >= monthStart) paidThisMonth += amount
    }
    if (inv.status === 'sent')    outstanding += amount
    if (inv.status === 'overdue') overdue     += amount
  }

  return { paidThisMonth, outstanding, overdue }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Billing() {
  const [invoices, setInvoices]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [selectedInvoice, setSelected]  = useState(null)
  const [editOpen, setEditOpen]         = useState(false)
  const { setNewInvoiceOpen }           = useUI()

  useEffect(() => {
    load()

    const channel = supabase
      .channel('billing-invoices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, load)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function load() {
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(name), projects(name)')
      .order('created_at', { ascending: false })

    setInvoices(data ?? [])
    setLoading(false)
  }

  function openInvoice(inv) {
    setSelected(inv)
    setEditOpen(true)
  }

  function closeEdit() {
    setEditOpen(false)
    setTimeout(() => setSelected(null), 300)
  }

  function handleUpdated(updated) {
    setInvoices(prev => prev.map(inv => inv.id === updated.id ? { ...inv, ...updated } : inv))
    setSelected(prev => prev ? { ...prev, ...updated } : prev)
  }

  function handleDeleted(id) {
    setInvoices(prev => prev.filter(inv => inv.id !== id))
    closeEdit()
  }

  if (loading) return <BillingSkeleton />

  const stats = computeStats(invoices)

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Paid this month" value={fmt(stats.paidThisMonth)} icon={CheckCircleIcon} color="emerald" />
        <StatCard label="Outstanding"     value={fmt(stats.outstanding)}   icon={ClockIcon}       color="blue"    />
        <StatCard label="Overdue"         value={fmt(stats.overdue)}       icon={AlertIcon}       color="amber"   />
      </div>

      {/* Table header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Invoices</span>
          <span className="text-xs text-zinc-600">{invoices.length}</span>
        </div>
        <button
          onClick={() => setNewInvoiceOpen(true)}
          className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
        >
          New invoice
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-16 flex flex-col items-center gap-2">
          <p className="text-sm text-zinc-500">No invoices yet</p>
          <p className="text-xs text-zinc-600">Create your first invoice using the button above</p>
        </div>
      ) : (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Invoice</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide hidden md:table-cell">Project</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {invoices.map(inv => (
                <InvoiceRow key={inv.id} inv={inv} onClick={() => openInvoice(inv)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InvoiceEditPanel
        invoice={selectedInvoice}
        open={editOpen}
        onClose={closeEdit}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  )
}

// ── Invoice row ───────────────────────────────────────────────────────────────
function InvoiceRow({ inv, onClick }) {
  const s = STATUS[inv.status] ?? STATUS.draft
  const dueDate = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <tr onClick={onClick} className="hover:bg-zinc-800/50 transition-colors cursor-pointer">
      <td className="px-5 py-3.5 font-mono text-xs text-zinc-300 whitespace-nowrap">
        {inv.invoice_number ?? '—'}
      </td>
      <td className="px-5 py-3.5 text-zinc-200 font-medium whitespace-nowrap">
        {inv.clients?.name ?? <span className="text-zinc-600">—</span>}
      </td>
      <td className="px-5 py-3.5 text-zinc-400 hidden md:table-cell whitespace-nowrap">
        {inv.projects?.name ?? <span className="text-zinc-600">—</span>}
      </td>
      <td className="px-5 py-3.5 text-zinc-200 text-right whitespace-nowrap tabular-nums font-medium">
        {fmt(inv.amount, inv.currency)}
      </td>
      <td className="px-5 py-3.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
          {s.label}
        </span>
      </td>
      <td className="px-5 py-3.5 text-zinc-500 text-xs hidden sm:table-cell whitespace-nowrap">
        {dueDate}
      </td>
    </tr>
  )
}

// ── Invoice edit panel ────────────────────────────────────────────────────────
function InvoiceEditPanel({ invoice, open, onClose, onUpdated, onDeleted }) {
  const [form, setForm]             = useState({ status: 'draft', amount: '', due_date: '' })
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saveError, setSaveError]   = useState(null)

  useEffect(() => {
    if (invoice) {
      setForm({
        status:   invoice.status   ?? 'draft',
        amount:   invoice.amount   != null ? invoice.amount : '',
        due_date: invoice.due_date ?? '',
      })
    }
    setConfirming(false)
    setSaveError(null)
  }, [invoice])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const updates = { status: form.status, amount: parseFloat(form.amount) || 0, due_date: form.due_date || null }
    const { error } = await safeUpdate('invoices', invoice.id, updates)
    setSaving(false)
    if (error) {
      setSaveError(error.message)
    } else {
      onUpdated({ ...invoice, ...updates })
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoice.id)

    setDeleting(false)
    if (!error) onDeleted(invoice.id)
  }

  const s = invoice ? (STATUS[invoice.status] ?? STATUS.draft) : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {!invoice ? null : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-white">{invoice.invoice_number ?? '—'}</span>
                {s && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.bg} ${s.text} ${s.border}`}>
                    {s.label}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="Close"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {saveError && (
                <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400">
                  {saveError}
                </div>
              )}

              {/* Read-only details */}
              <div className="space-y-4">
                <DetailRow label="Client"  value={invoice.clients?.name} />
                <DetailRow label="Project" value={invoice.projects?.name} />
                {invoice.issue_date && (
                  <DetailRow
                    label="Issued"
                    value={new Date(invoice.issue_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  />
                )}
              </div>

              <div className="border-t border-zinc-800 pt-5 space-y-4">
                {/* Status */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    Amount ({invoice.currency ?? 'GBP'})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                  />
                </div>

                {/* Due date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Due date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Delete confirm */}
              {confirming && (
                <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-4 space-y-3">
                  <p className="text-sm text-red-400 font-medium">Delete {invoice.invoice_number}?</p>
                  <p className="text-xs text-zinc-500">This is permanent and cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 py-2 rounded-md bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="flex-1 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 flex-shrink-0 flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setConfirming(true)}
                className="px-4 py-2 rounded-md border border-red-800/60 hover:bg-red-950/40 text-red-400 text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-zinc-300">{value}</p>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
const CARD_COLOR = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20'    },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20'   },
}

function StatCard({ label, value, icon: Icon, color }) {
  const c = CARD_COLOR[color]
  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center border ${c.bg} ${c.border}`}>
          <Icon className={`w-3.5 h-3.5 ${c.text}`} />
        </div>
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${c.text}`}>{value}</p>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 rounded bg-zinc-800" />
              <div className="w-7 h-7 rounded-md bg-zinc-800" />
            </div>
            <div className="h-7 w-32 rounded bg-zinc-800" />
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden animate-pulse">
        <div className="px-5 py-3 border-b border-zinc-800 flex gap-8">
          {[80, 100, 120, 60, 70, 60].map((w, i) => (
            <div key={i} className="h-3 rounded bg-zinc-800" style={{ width: w }} />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-5 py-3.5 border-b border-zinc-800 flex gap-8 items-center">
            {[80, 100, 120, 60, 70, 60].map((w, j) => (
              <div key={j} className="h-3 rounded bg-zinc-800" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function XIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function CheckCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  )
}
function ClockIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
    </svg>
  )
}
function AlertIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  )
}
