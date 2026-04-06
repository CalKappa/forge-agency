import { Link } from 'react-router-dom'
import { AGENT_CONFIG, COLOR_CLASSES } from '../lib/agents'

const AGENT_ICONS = {
  researcher:       SearchIcon,
  designer:         PenIcon,
  developer:        CodeIcon,
  reviewer:         CheckIcon,
  'seo-specialist': TrendingUpIcon,
}

export default function Agents() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-500">Select an agent to start or continue a conversation.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Object.values(AGENT_CONFIG).map(agent => {
          const c    = COLOR_CLASSES[agent.color]
          const Icon = AGENT_ICONS[agent.key]
          return (
            <Link
              key={agent.key}
              to={`/agents/${agent.key}`}
              className="group rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-6 flex flex-col gap-5 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${c.badge}`}>
                  <Icon className={`w-5 h-5 ${c.icon}`} />
                </div>
                <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors flex items-center gap-1">
                  Open chat
                  <ChevronRightIcon className="w-3 h-3" />
                </span>
              </div>

              <div className="space-y-1">
                <h3 className={`text-sm font-semibold ${c.heading}`}>{agent.label}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{agent.description}</p>
              </div>

              <p className="text-xs text-zinc-700 leading-relaxed line-clamp-3">
                {agent.system}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function SearchIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>
}
function PenIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
}
function CodeIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><polyline strokeLinecap="round" strokeLinejoin="round" points="16 18 22 12 16 6" /><polyline strokeLinecap="round" strokeLinejoin="round" points="8 6 2 12 8 18" /></svg>
}
function CheckIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
}
function TrendingUpIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><polyline strokeLinecap="round" strokeLinejoin="round" points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline strokeLinecap="round" strokeLinejoin="round" points="17 6 23 6 23 12" /></svg>
}
function ChevronRightIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" /></svg>
}
