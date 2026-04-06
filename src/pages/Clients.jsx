import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STATUS_CONFIG = {
  active:            { dot: 'bg-emerald-400', label: 'Active',          text: 'text-emerald-400' },
  lead:              { dot: 'bg-amber-400',   label: 'Needs attention', text: 'text-amber-400'   },
  'needs attention': { dot: 'bg-amber-400',   label: 'Needs attention', text: 'text-amber-400'   },
  inactive:          { dot: 'bg-zinc-500',    label: 'Inactive',        text: 'text-zinc-500'    },
}

export default function Clients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    fetchClients()

    const channel = supabase
      .channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchClients)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) { setError(error.message) } else { setClients(data) }
    setLoading(false)
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search clients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm pl-9 pr-4 py-2 rounded-md bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
        />
      </div>

      {/* States */}
      {error && (
        <div className="rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400">
          Failed to load clients: {error}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-lg bg-zinc-900 border border-zinc-800 p-5 space-y-3 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-zinc-800" />
              <div className="h-3 w-1/2 rounded bg-zinc-800" />
              <div className="h-3 w-1/3 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-14 flex flex-col items-center gap-2">
          <p className="text-sm text-zinc-500">
            {search ? `No clients matching "${search}"` : 'No clients yet'}
          </p>
          {!search && (
            <p className="text-xs text-zinc-600">Add your first client with the button above</p>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => (
            <ClientCard key={client.id} client={client} onClick={() => navigate(`/clients/${client.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Client card ── */

function ClientCard({ client, onClick }) {
  const status = STATUS_CONFIG[client.status] ?? STATUS_CONFIG.inactive

  return (
    <div
      onClick={onClick}
      className="group rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-5 flex flex-col gap-4 transition-colors cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{client.name}</h3>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium flex-shrink-0 ${status.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {/* Contact */}
      <div className="space-y-1.5">
        {client.email && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0">
            <MailIcon className="w-3.5 h-3.5 flex-shrink-0 text-zinc-600" />
            <span className="truncate">{client.email}</span>
          </div>
        )}
        {client.phone && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <PhoneIcon className="w-3.5 h-3.5 flex-shrink-0 text-zinc-600" />
            <span>{client.phone}</span>
          </div>
        )}
      </div>

      {/* Notes preview */}
      {client.notes && (
        <p className="text-xs text-zinc-600 line-clamp-2 border-t border-zinc-800 pt-3">
          {client.notes}
        </p>
      )}
    </div>
  )
}

/* ── Icons ── */

function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" d="m21 21-4.35-4.35" />
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


