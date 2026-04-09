import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { UIProvider }       from './context/UIContext'
import { ToastProvider }    from './context/ToastContext'
import { ConfirmProvider }  from './context/ConfirmContext'
import { PipelineProvider } from './context/PipelineContext'
import { supabase }         from './lib/supabase'
import Layout        from './components/Layout'
import Login         from './pages/Login'
import ClientBrief   from './pages/ClientBrief'
import Dashboard     from './pages/Dashboard'
import Clients       from './pages/Clients'
import Projects      from './pages/Projects'
import Activity      from './pages/Activity'
import Agents        from './pages/Agents'
import AgentChat     from './pages/AgentChat'
import ProjectDetail from './pages/ProjectDetail'
import ClientDetail  from './pages/ClientDetail'
import Editor        from './pages/Editor'
import Billing       from './pages/Billing'
import NewBrief      from './pages/NewBrief'
import SeoAudit      from './pages/SeoAudit'

export default function App() {
  // null = still checking, false = no session, object = authenticated session
  const [session,     setSession]     = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Check for an existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthChecked(true)
    })

    // Keep session state in sync with login / logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    // Request browser notification permission so we can alert on Orchestrator completion
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => subscription.unsubscribe()
  }, [])

  // /brief/:token is always public — render it immediately, no auth check needed
  if (window.location.pathname.startsWith('/brief/')) {
    return (
      <Routes>
        <Route path="/brief/:token" element={<ClientBrief />} />
      </Routes>
    )
  }

  // Blank screen while the session check resolves — prevents any data fetching by child pages
  if (!authChecked) return null

  // Not authenticated — show login, nothing else
  if (!session) return <Login />

  return (
    <PipelineProvider>
    <UIProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="clients"                element={<Clients />} />
              <Route path="clients/:clientId"      element={<ClientDetail />} />
              <Route path="projects"               element={<Projects />} />
              <Route path="projects/:projectId"    element={<ProjectDetail />} />
              <Route path="activity"               element={<Activity />} />
              <Route path="agents"                 element={<Agents />} />
              <Route path="agents/:agentKey"       element={<AgentChat />} />
              <Route path="billing"                element={<Billing />} />
              <Route path="editor"                 element={<Editor />} />
              <Route path="briefs/new"             element={<NewBrief />} />
              <Route path="seo-audit/:clientId"    element={<SeoAudit />} />
            </Route>
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </UIProvider>
    </PipelineProvider>
  )
}
