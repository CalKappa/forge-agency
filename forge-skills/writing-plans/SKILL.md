---
name: writing-plans
description: >
  Use AFTER brainstorming spec is approved. Breaks the approved design spec
  into a precise, task-by-task implementation plan for the Developer agent.
  Every task must have exact file paths, complete code intent, and a
  verification step. Triggers after client approves the design spec.
---

# Writing Plans Skill — Forge Agency

## When to invoke
Only after the brainstorming skill has produced an approved spec.
Never plan without an approved spec.

---

## Goal
Produce an implementation plan so detailed that an agent with zero project
context can execute each task independently and correctly.

---

## Workflow

### Step 1 — Map files to responsibilities
Before writing any tasks, list every file that will be created or modified:

```
src/
  pages/
    Home.jsx          → Hero, services grid, trust signals, CTA
    Services.jsx      → Expandable service cards
    Contact.jsx       → Quote form + map embed
  components/
    Header.jsx        → Logo, nav, mobile burger menu
    Footer.jsx        → Contact details, links, social
    ReviewWidget.jsx  → Google reviews carousel
  styles/
    tokens.css        → Colours, fonts, spacing variables
    global.css        → Resets, base styles
```

One file = one clear responsibility. No files that "do everything."

### Step 2 — Write tasks
Each task must be completable in under 10 minutes. Format:

---
#### Task N: [Component Name]
**Files:**
- Create: `src/components/Header.jsx`
- Modify: `src/styles/tokens.css` (add brand colour variables)

**What to build:**
Clear description of what this component does and what it must contain.
Include: copy, links, responsive behaviour, any dynamic logic.

**Design spec reference:**
Quote the relevant section from the approved spec.

**Verification:**
- [ ] Component renders without errors
- [ ] Matches approved colour palette (check tokens.css)
- [ ] Mobile layout tested at 375px
- [ ] No hardcoded colours or fonts (use CSS variables)
---

### Step 3 — Order tasks correctly
Dependency order:
1. CSS tokens and global styles (everything depends on these)
2. Layout components (Header, Footer)
3. Page sections (Hero, Services, etc.)
4. Dynamic components (forms, widgets)
5. Page assembly (import all components into pages)
6. Final polish (spacing, animation, responsiveness)

### Step 4 — Save the plan
Save to: `docs/plans/YYYY-MM-DD-<client-slug>-plan.md`

Add at the top:
```
## Implementation Plan: [Client Name]
**Spec:** docs/specs/YYYY-MM-DD-<client-slug>-design.md
**Agent:** Developer
**Reviewer:** Reviewer agent runs after all tasks complete
```

### Step 5 — Hand off to Developer agent
The Developer agent picks up this plan and executes tasks in order.
The Reviewer agent runs after all tasks are marked complete.

---

## Rules
- Every task must have a verification step — no exceptions
- Tasks must reference the spec, not re-invent decisions
- If the spec is ambiguous, go back to brainstorming — don't guess
- Plans are for agents, not clients — be precise, not polite
