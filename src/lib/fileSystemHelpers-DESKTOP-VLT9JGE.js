// The local Express file server is only available in development.
// In production (Vercel) all functions silently no-op so no broken requests are made.
const DEV = import.meta.env.DEV
const SERVER = 'http://localhost:3001'

function sanitise(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
}

/**
 * Save an array of { filename, content } files to the local filesystem via the Express server.
 * Only runs in development — silently no-ops in production.
 * @param {string} clientName
 * @param {string} projectName
 * @param {{ filename: string, content: string }[]} files
 * @param {(message: string, type?: 'success'|'error'|'warning') => void} showToast
 */
export async function saveFilesToDisk(clientName, projectName, files, showToast) {
  if (!DEV) return

  try {
    const health = await fetch(`${SERVER}/api/health`, { signal: AbortSignal.timeout(2000) })
    if (!health.ok) throw new Error('not ok')
  } catch {
    showToast('Local file server is not running — start it with npm run server', 'warning')
    return
  }

  try {
    const res = await fetch(`${SERVER}/api/save-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, projectName, files }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      showToast(body.error ?? 'Failed to save files to disk', 'error')
      return
    }
    showToast(`Files saved to client-sites/${sanitise(clientName)}/${sanitise(projectName)}/`, 'success')
  } catch (err) {
    showToast(err.message ?? 'Failed to save files to disk', 'error')
  }
}

/**
 * Open the project folder in Windows Explorer via the Express server.
 * Only runs in development — silently no-ops in production.
 * @param {string} clientName
 * @param {string} projectName
 * @param {(message: string, type?: 'success'|'error'|'warning') => void} showToast
 */
export async function openProjectFolder(clientName, projectName, showToast) {
  if (!DEV) return

  try {
    const res = await fetch(`${SERVER}/api/open-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, projectName }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      showToast(body.error ?? 'Failed to open folder', 'error')
    }
  } catch {
    showToast('Local file server is not running — start it with npm run server', 'warning')
  }
}
