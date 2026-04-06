import { createContext, useContext, useState, useEffect } from 'react'

const ToastContext = createContext(null)

const COLORS = {
  success: 'bg-emerald-600',
  error:   'bg-red-600',
  warning: 'bg-amber-500',
}

function ToastItem({ id, message, type, onRemove }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Tiny delay so the initial opacity-0 state is painted before transitioning in
    const showTimer   = setTimeout(() => setVisible(true),  16)
    // Start fade-out 300ms before removal so transition completes cleanly
    const hideTimer   = setTimeout(() => setVisible(false), 2700)
    const removeTimer = setTimeout(() => onRemove(id),      3100)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
      clearTimeout(removeTimer)
    }
  }, [id, onRemove])

  const bg = COLORS[type] ?? 'bg-zinc-700'

  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 rounded-lg shadow-2xl text-sm font-medium text-white
        min-w-64 max-w-sm pointer-events-auto
        transition-all duration-300
        ${bg}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
      `}
    >
      <span className="mt-px flex-shrink-0 text-base leading-none select-none">
        {type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠'}
      </span>
      <span className="leading-snug">{message}</span>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  function removeToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'success'|'error'|'warning'} type  defaults to 'success'
   */
  function showToast(message, type = 'success') {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, message, type }])
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}

      {/* Toast container — fixed bottom-right, pointer-events-none so it doesn't block UI */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} {...t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Hook to trigger toasts from any component.
 * Returns showToast(message, type) where type is 'success' | 'error' | 'warning'.
 */
export function useToast() {
  return useContext(ToastContext)
}
