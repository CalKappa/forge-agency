import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom'
import { useUI } from '../context/UIContext'
import { usePipeline } from '../hooks/usePipeline'
import { supabase } from '../lib/supabase'
import NewClientPanel from './NewClientPanel'
import NewProjectPanel from './NewProjectPanel'
import NewBriefPanel from './NewBriefPanel'
import NewInvoicePanel from './NewInvoicePanel'

const navItems = [
  { label: 'Dashboard', to: '/', icon: GridIcon },
  { label: 'Clients', to: '/clients', icon: UsersIcon },
  { label: 'Projects', to: '/projects', icon: FolderIcon },
  { label: 'Activity', to: '/activity', icon: ActivityIcon },
  { label: 'Agents', to: '/agents', icon: BotIcon },
  { label: 'Editor', to: '/editor', icon: CodeIcon },
  { label: 'Billing', to: '/billing', icon: CreditCardIcon },
]

const pageTitles = {
  '/': 'Dashboard',
  '/clients': 'Clients',
  '/projects': 'Projects',
  '/activity': 'Activity',
  '/agents': 'Agents',
  '/agents/researcher': 'Researcher',
  '/agents/designer':   'Designer',
  '/agents/developer':  'Developer',
  '/agents/reviewer':   'Reviewer',
  '/billing': 'Billing',
  '/editor':  'Editor',
  '/briefs/new': 'New Brief',
}

export default function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const title = pageTitles[pathname]
    ?? (pathname.startsWith('/projects/') ? 'Project' : pathname.startsWith('/clients/') ? 'Client' : pathname.startsWith('/briefs/') ? 'Brief' : pathname === '/editor' ? 'Editor' : 'Dashboard')
  const { newClientOpen, setNewClientOpen, newProjectOpen, setNewProjectOpen, newBriefOpen, setNewBriefOpen, newInvoiceOpen, setNewInvoiceOpen } = useUI()
  const { pipeline } = usePipeline()

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <NewClientPanel open={newClientOpen} onClose={() => setNewClientOpen(false)} />
      <NewProjectPanel open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
      <NewBriefPanel open={newBriefOpen} onClose={() => setNewBriefOpen(false)} />
      <NewInvoicePanel open={newInvoiceOpen} onClose={() => setNewInvoiceOpen(false)} />
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-zinc-900 border-r border-zinc-800">
        {/* Brand */}
        <div className="h-16 flex items-center px-5 border-b border-zinc-800">
          <span className="text-base font-semibold tracking-tight text-white">
            <span className="text-violet-400">Forge</span> Agency
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {navItems.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-600/20 text-violet-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Pipeline status widget */}
        {pipeline.status !== 'idle' && (
          <div
            onClick={() => pipeline.projectId && navigate(`/projects/${pipeline.projectId}`)}
            className={`mx-3 mb-3 rounded-lg border p-3 text-xs transition-colors ${
              pipeline.status === 'running'
                ? 'border-emerald-700/50 bg-emerald-950/40 cursor-pointer hover:bg-emerald-950/60'
                : pipeline.status === 'complete'
                ? 'border-emerald-600/40 bg-emerald-950/30'
                : 'border-red-700/50 bg-red-950/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {pipeline.status === 'running' && (
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
              {pipeline.status === 'complete' && (
                <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {pipeline.status === 'error' && (
                <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className={`font-medium truncate ${
                pipeline.status === 'running' ? 'text-emerald-300'
                : pipeline.status === 'complete' ? 'text-emerald-400'
                : 'text-red-400'
              }`}>
                {pipeline.status === 'running' ? 'Agent running'
                  : pipeline.status === 'complete' ? 'Complete'
                  : 'Error'}
              </span>
            </div>
            {pipeline.projectName && (
              <p className="text-zinc-400 truncate mb-0.5">{pipeline.projectName}</p>
            )}
            {pipeline.stepLabel && pipeline.status === 'running' && (
              <p className="text-zinc-500 truncate">{pipeline.stepLabel}</p>
            )}
            {pipeline.status === 'running' && pipeline.progress > 0 && (
              <div className="mt-2 h-1 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${pipeline.progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-4 border-t border-zinc-800 space-y-3">
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            <SignOutIcon className="w-4 h-4 flex-shrink-0" />
            Sign Out
          </button>
          <p className="text-xs text-zinc-600 pl-1">© 2026 Forge Agency</p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-zinc-900 border-b border-zinc-800">
          <h1 className="text-base font-semibold text-white">{title}</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNewClientOpen(true)}
              className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              New client
            </button>
            <button
              onClick={() => setNewProjectOpen(true)}
              className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              New project
            </button>
            <Link
              to="/briefs/new"
              className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              New brief
            </Link>
            <button
              onClick={() => setNewBriefOpen(true)}
              className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              Quick brief
            </button>
            <button
              onClick={() => setNewInvoiceOpen(true)}
              className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              New invoice
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ── Inline SVG icon components ── */

function GridIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function FolderIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ActivityIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BotIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path strokeLinecap="round" d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" strokeLinecap="round" strokeWidth={2.5} />
      <line x1="12" y1="16" x2="12" y2="16" strokeLinecap="round" strokeWidth={2.5} />
      <line x1="16" y1="16" x2="16" y2="16" strokeLinecap="round" strokeWidth={2.5} />
    </svg>
  )
}

function CreditCardIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" strokeLinecap="round" />
    </svg>
  )
}

function CodeIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  )
}

function SignOutIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
    </svg>
  )
}
