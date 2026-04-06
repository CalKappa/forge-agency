import { createContext, useContext, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [modal, setModal] = useState(null)

  /**
   * Show a confirmation dialog. Returns a Promise that resolves to true
   * (confirmed) or false (cancelled). Usage mirrors window.confirm():
   *
   *   if (!await confirm({ title, message })) return
   */
  function confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger' }) {
    return new Promise((resolve) => {
      setModal({
        title,
        message,
        confirmLabel,
        cancelLabel,
        variant,
        onConfirm: () => { setModal(null); resolve(true)  },
        onCancel:  () => { setModal(null); resolve(false) },
      })
    })
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {modal && <ConfirmModal {...modal} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext)
}
