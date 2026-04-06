import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})

export const ORCHESTRATOR_SYSTEM = `You are an orchestrator for an AI web design agency. When given a client brief, break it down into four clearly labelled task lists for: 1) Researcher, 2) Designer, 3) Developer, 4) Reviewer. Be specific and actionable.`
