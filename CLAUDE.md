# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server at http://localhost:5173
npm run build        # production build
npm run lint         # ESLint
npm run preview      # preview production build locally
npm run setup-db     # run DB migration (requires SUPABASE_ACCESS_TOKEN in .env)
```

There are no tests. There is no TypeScript — the codebase is plain JSX/JS.

## Environment variables

```
VITE_ANTHROPIC_API_KEY      # Anthropic API key (exposed to browser, intentional)
VITE_SUPABASE_URL           # https://oimojcsxqaajdknltqvx.supabase.co
VITE_SUPABASE_ANON_KEY      # Supabase anon/publishable key
SUPABASE_ACCESS_TOKEN       # Supabase Management API token — only used by setup-db.js, never sent to browser
```

## Stack

- **React 19 + Vite 8** — no TypeScript
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin — there is no `tailwind.config.js` or `postcss.config.js`; do not add them
- **React Router v7** — `BrowserRouter` wrapping everything in `main.jsx`
- **Supabase JS v2** (`@supabase/supabase-js`) — realtime, auth-free, anon key only
- **@anthropic-ai/sdk** — `dangerouslyAllowBrowser: true` is intentional; this is a browser-only app with no backend

## Architecture

### Routing (`src/App.jsx`)

All routes are children of `<Layout />`. Current routes: `/`, `/clients`, `/projects`, `/projects/:projectId`, `/activity`, `/agents`, `/agents/:agentKey`, `/billing`.

### Shell (`src/components/Layout.jsx`)

Renders the sidebar + topbar. **All four slide-in panels are mounted here** (`NewClientPanel`, `NewProjectPanel`, `NewBriefPanel`, `NewInvoicePanel`) so they're accessible from any page. The topbar "New client / New project / New brief / New invoice" buttons live here too. Page titles are resolved from a static `pageTitles` map; dynamic routes (`/projects/:id`, `/agents/:key`) fall back to a prefix check.

### Global panel state (`src/context/UIContext.jsx`)

`UIProvider` wraps the entire app and holds one `open/setOpen` boolean per panel (`newClientOpen`, `newProjectOpen`, `newBriefOpen`, `newInvoiceOpen`). Any component that needs to open a panel calls `useUI()` and sets the relevant boolean — no prop drilling.

### Lib singletons (`src/lib/`)

- `supabase.js` — exports the Supabase client
- `anthropic.js` — exports the Anthropic client and `ORCHESTRATOR_SYSTEM` prompt
- `agents.js` — exports `AGENT_CONFIG` (researcher/designer/developer/reviewer with key, label, color, description, system prompt) and `COLOR_CLASSES` (Tailwind class bundles per color)

### Recurring page patterns

**Realtime data loading:** Every page creates a `supabase.channel()` subscription in `useEffect`, listens to `postgres_changes` on its relevant tables, and calls a local `load()` function on any event. The channel is removed in the cleanup function.

**Streaming text (Anthropic):** Use a `useRef('')` (not state) to accumulate chunks inside a `for await` loop over `anthropic.messages.stream()`, then sync to state for rendering. This avoids stale closure issues. See `AgentChat.jsx` (`streamRef`) and `NewBriefPanel.jsx` for the pattern.

**Brief → agent chat handoff:** The Dashboard and ProjectDetail pass `state={{ briefText }}` on React Router `<Link>` to agent chat routes. `AgentChat.jsx` reads `location.state?.briefText`, immediately clears it with `navigate(location.pathname, { replace: true, state: null })`, then auto-sends it as the first message if the conversation is empty.

**Slide-in panels:** Animated with `translate-x-full` / `translate-x-0` on a fixed right-side div. Backdrop is a separate fixed div with `pointer-events-none` when closed.

## Database schema

All tables are in Supabase (PostgreSQL). Realtime is enabled on all tables.

```
clients       id, name, email, phone, status ('active'|'inactive'|'lead'|'needs attention'), notes, created_at
projects      id, client_id → clients, name, status, current_stage ('Research'|'Design'|'Dev'|'Review'|'Delivered'), created_at
briefs        id, client_id → clients, project_id → projects, brief_text, submitted_at, orchestrator_response
agent_messages  id, agent_key, role ('user'|'assistant'), content, created_at
invoices      id, invoice_number (auto 'INV-NNN' via sequence), client_id → clients, project_id → projects,
              amount (numeric), currency (default 'GBP'), status ('draft'|'sent'|'paid'|'overdue'),
              issue_date, due_date, created_at
```

**DDL cannot be run via the Supabase JS client.** Use the Supabase SQL editor or the Management API (`https://api.supabase.com/v1/projects/oimojcsxqaajdknltqvx/database/query`) for schema changes. `scripts/setup-db.js` only covers the initial three tables; `orchestrator_response`, `agent_messages`, and `invoices` were added via the Management API directly and are not reflected in that script.

## Styling conventions

- Dark theme only; background hierarchy is `zinc-950` → `zinc-900` → `zinc-800`
- Primary accent: `violet-600` (buttons, active nav, focus rings)
- Status/agent colors follow a consistent system: blue=Researcher, violet=Designer, emerald=Developer, amber=Reviewer; these are defined in `COLOR_CLASSES` in `src/lib/agents.js` and should be the single source of truth
- Per-agent model preference is persisted to localStorage under the key `forge_agent_model_${agentKey}`
