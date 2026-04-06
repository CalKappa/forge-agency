import { usePipelineContext } from '../context/PipelineContext'

/**
 * usePipeline — thin hook wrapping PipelineContext.
 *
 * Provides:
 *   pipeline          — the raw pipeline state object
 *   start / append / setStep / setProgress / complete / errorPipeline / clear
 *   isRunningForProject(projectId)    — true while status === 'running' for that project
 *   isAgentActive(projectId, name)    — true when that specific agent is the current step
 *   liveText(projectId, agentName)    — accumulated text for that agent (empty if not active)
 */
export function usePipeline() {
  const ctx = usePipelineContext()
  const { pipeline } = ctx

  function isRunningForProject(projectId) {
    return pipeline.projectId === projectId && pipeline.status === 'running'
  }

  function isAgentActive(projectId, agentName) {
    return isRunningForProject(projectId) && pipeline.agentName === agentName
  }

  /**
   * Returns the accumulated live text only when this exact agent is the active step.
   * Falls back to '' so callers can safely use  `localState || liveText(...)`.
   */
  function liveText(projectId, agentName) {
    return isAgentActive(projectId, agentName) ? pipeline.text : ''
  }

  /**
   * Returns live text for any Developer-* step.
   * Used by ProjectDetail since the developer has multiple sub-steps.
   */
  function devLiveText(projectId) {
    if (!isRunningForProject(projectId)) return ''
    if (!pipeline.agentName?.startsWith('Developer-')) return ''
    return pipeline.text
  }

  return {
    ...ctx,
    isRunningForProject,
    isAgentActive,
    liveText,
    devLiveText,
  }
}
