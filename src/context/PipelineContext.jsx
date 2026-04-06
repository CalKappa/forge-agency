import { createContext, useContext, useRef, useState } from 'react'

/**
 * Global pipeline state that persists across React navigation.
 *
 * The key insight: the Provider lives at app root and never unmounts.
 * When a streaming for-await loop runs inside ProjectDetail and the user
 * navigates away (unmounting ProjectDetail), the loop keeps executing in JS
 * and can safely call append() — which updates root-level state that IS
 * still mounted. When the user navigates back, ProjectDetail reads the
 * already-accumulated text from the context immediately.
 */

const IDLE = {
  projectId:   null,
  projectName: null,
  clientName:  null,
  agentName:   null,   // 'researcher' | 'designer' | 'Developer-Stack' | ... | 'Orchestrator'
  stepLabel:   null,   // human-readable current step label
  status:      'idle', // 'idle' | 'running' | 'complete' | 'error'
  text:        '',     // accumulated streaming text for the current step
  progress:    0,      // 0-100
}

const PipelineContext = createContext(null)

export function PipelineProvider({ children }) {
  const [pipeline, setPipeline] = useState(IDLE)
  // Accumulator ref — outlives any component and is captured by in-flight for-await closures
  const accRef = useRef('')

  /** Call before starting a new stream. */
  function start({ projectId, projectName, clientName, agentName, stepLabel = agentName }) {
    accRef.current = ''
    setPipeline({
      projectId,
      projectName: projectName ?? null,
      clientName:  clientName  ?? null,
      agentName,
      stepLabel,
      status:   'running',
      text:     '',
      progress: 0,
    })
  }

  /** Call for each text chunk received from the stream. */
  function append(chunk) {
    accRef.current += chunk
    const snapshot = accRef.current
    setPipeline(p => ({ ...p, text: snapshot }))
  }

  /**
   * Call when switching to a new step within the same pipeline run
   * (e.g. Developer-Stack → Developer-CSS → Developer-HTML-...).
   * Resets the accumulated text for the new step.
   */
  function setStep(agentName, stepLabel, progress = 0) {
    accRef.current = ''
    setPipeline(p => ({ ...p, agentName, stepLabel, progress, text: '' }))
  }

  /** Update progress percentage without changing anything else. */
  function setProgress(progress) {
    setPipeline(p => ({ ...p, progress }))
  }

  /** Call when the pipeline (or full multi-step run) successfully finishes. */
  function complete() {
    setPipeline(p => ({ ...p, status: 'complete', progress: 100 }))
    setTimeout(() => {
      accRef.current = ''
      setPipeline(IDLE)
    }, 5000)
  }

  /** Call on API error. */
  function errorPipeline(msg) {
    console.warn('[Pipeline] error:', msg)
    setPipeline(p => ({ ...p, status: 'error' }))
    setTimeout(() => {
      accRef.current = ''
      setPipeline(IDLE)
    }, 5000)
  }

  /** Call to reset immediately (e.g. on manual cancel). */
  function clear() {
    accRef.current = ''
    setPipeline(IDLE)
  }

  return (
    <PipelineContext.Provider
      value={{ pipeline, start, append, setStep, setProgress, complete, errorPipeline, clear }}
    >
      {children}
    </PipelineContext.Provider>
  )
}

export function usePipelineContext() {
  const ctx = useContext(PipelineContext)
  if (!ctx) throw new Error('usePipelineContext must be used within PipelineProvider')
  return ctx
}
