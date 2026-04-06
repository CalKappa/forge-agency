import { createContext, useContext, useState } from 'react'

const UIContext = createContext(null)

export function UIProvider({ children }) {
  const [newClientOpen, setNewClientOpen]   = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newBriefOpen, setNewBriefOpen]     = useState(false)
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false)
  // Incrementing counter — Dashboard depends on this so it reloads when bumped
  const [dashboardVersion, setDashboardVersion] = useState(0)
  // Last project created via NewProjectPanel — watched by ClientDetail and Projects
  const [lastCreatedProject, setLastCreatedProject] = useState(null)

  function bumpDashboard() {
    setDashboardVersion(v => v + 1)
  }

  function notifyProjectCreated(project) {
    setLastCreatedProject(project)
  }

  return (
    <UIContext.Provider value={{ newClientOpen, setNewClientOpen, newProjectOpen, setNewProjectOpen, newBriefOpen, setNewBriefOpen, newInvoiceOpen, setNewInvoiceOpen, dashboardVersion, bumpDashboard, lastCreatedProject, notifyProjectCreated }}>
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  return useContext(UIContext)
}
