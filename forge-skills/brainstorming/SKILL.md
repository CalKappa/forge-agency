---
name: brainstorming
description: >
  Use BEFORE any website build, feature addition, or redesign task. Refines
  the client brief into a validated spec before any code is written. Triggers
  on: "build me a site", "add a section", "redesign", or any creative web task.
---

# Brainstorming Skill — Forge Agency

## When to invoke
Invoke this skill FIRST before the Designer or Developer agents activate.
Never skip brainstorming for a new site or significant feature.

## Goal
Turn a rough client brief into a signed-off design spec that all downstream
agents (Designer, Developer, Reviewer) can work from without ambiguity.

---

## Workflow

### Step 1 — Explore project context
Before asking the client anything, read what you already know:
- Business name, trade, and location
- Existing website (if any) — check for structure, copy, imagery
- Competitor sites in the same trade and city
- SEO keywords relevant to the trade + location

### Step 2 — Ask clarifying questions (one at a time)
Use multiple-choice where possible. Cover:
- **Goal**: What does the site need to achieve? (leads, calls, trust-building)
- **Audience**: Who visits? (homeowners, businesses, emergency callers)
- **Tone**: Professional/corporate? Friendly/local? Premium/luxury?
- **Must-haves**: Specific pages, trust badges, Google reviews widget, quote form
- **Brand assets**: Logo, brand colours, existing photos — or need generating?

YAGNI rule: strip out anything the client hasn't explicitly asked for.

### Step 3 — Propose 2–3 design directions
Present short descriptions (not code). Example:
- **Option A – Clean & Professional**: White space, navy + gold, trust-first layout
- **Option B – Bold & Local**: Strong headline, trade imagery, call-to-action above fold
- **Option C – Conversion-focused**: Minimal pages, quote form prominent, fast load

### Step 4 — Present design spec in sections
Get approval section by section, not all at once:
1. Pages & structure (Home, Services, About, Contact etc.)
2. Above-the-fold design (hero, headline, CTA)
3. Key sections (services grid, trust signals, testimonials)
4. Footer & contact block

### Step 5 — Write and save the spec
Save to: `docs/specs/YYYY-MM-DD-<client-slug>-design.md`
Run a self-check before handing off:
- [ ] No placeholders left (e.g. "[TBD]" or "lorem ipsum")
- [ ] All pages listed with their purpose
- [ ] Tone, palette, and font direction specified
- [ ] Conversion goal is clear (phone call? form submission?)

### Step 6 — Hand off to Designer
Invoke the `writing-plans` skill to create the implementation plan.
Do NOT write any code during brainstorming.

---

## Rules
- One question at a time — never dump a list of questions
- Always propose alternatives, never jump to one solution
- YAGNI: If the client hasn't asked for it, don't include it
- Brainstorming ends only when the client has approved the spec in writing
